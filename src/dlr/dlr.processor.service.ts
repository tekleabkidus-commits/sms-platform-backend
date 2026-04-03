import { createHash } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { MetricsService } from '../common/metrics/metrics.service';
import { DatabaseService } from '../database/database.service';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopics } from '../kafka/kafka-topics';
import { MessagesService } from '../messages/messages.service';
import { OutboxService } from '../outbox/outbox.service';
import { RuntimeRoleService } from '../runtime/runtime-role.service';

interface DlrWebhookRow {
  id: number;
  received_date: string;
  provider_id: number;
  tenant_id: string | null;
  provider_message_id: string | null;
  payload: Record<string, unknown>;
  normalized_status: string | null;
  processed: boolean;
}

@Injectable()
export class DlrProcessorService implements OnModuleInit {
  constructor(
    private readonly kafkaService: KafkaService,
    private readonly databaseService: DatabaseService,
    private readonly messagesService: MessagesService,
    private readonly outboxService: OutboxService,
    private readonly runtimeRoleService: RuntimeRoleService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.runtimeRoleService.hasCapability('dlrProcessor')) {
      return;
    }
    await this.kafkaService.subscribe(KafkaTopics.SmsDlr, 'dlr-processor', async ({ value }) => {
      const payload = JSON.parse(value) as { receivedDate: string; webhookId: number; providerId: number };
      await this.processWebhook(payload.receivedDate, payload.webhookId, payload.providerId);
    });
  }

  private extractFirstString(payload: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private extractFirstNumber(payload: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private async markProcessed(receivedDate: string, webhookId: number, processingError?: string): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE dlr_webhooks
        SET processed = TRUE,
            processing_error = $3,
            processed_at = now()
        WHERE received_date = $1 AND id = $2
      `,
      [receivedDate, webhookId, processingError ?? null],
    );
  }

  private async enqueueReconciliation(webhook: DlrWebhookRow, reason: string, extra: Record<string, unknown> = {}): Promise<void> {
    await this.databaseService.withTransaction(async (tx) => {
      await this.outboxService.enqueue({
        tenantId: webhook.tenant_id ?? undefined,
        aggregateType: 'dlr_webhook',
        aggregateId: `${webhook.received_date}:${webhook.id}`,
        eventType: 'dlr.reconcile',
        topicName: KafkaTopics.SmsReconcile,
        partitionKey: webhook.tenant_id ?? String(webhook.provider_id),
        dedupeKey: `dlr:${webhook.received_date}:${webhook.id}:reconcile:${reason}`,
        payload: {
          tenantId: webhook.tenant_id,
          providerId: webhook.provider_id,
          kind: 'dlr_unmatched',
          reason,
          payload: {
            receivedDate: webhook.received_date,
            webhookId: webhook.id,
            providerMessageId: webhook.provider_message_id,
            normalizedStatus: webhook.normalized_status,
            ...extra,
            raw: webhook.payload,
          },
        },
      }, tx);

      await tx.client.query(
        `
          UPDATE dlr_webhooks
          SET processed = TRUE,
              processing_error = $3,
              processed_at = now()
          WHERE received_date = $1 AND id = $2
        `,
        [webhook.received_date, webhook.id, reason],
      );
    });
  }

  private async processWebhook(receivedDate: string, webhookId: number, providerId: number): Promise<void> {
    const result = await this.databaseService.query<DlrWebhookRow>(
      `
        SELECT id, received_date, provider_id, tenant_id, provider_message_id, payload, normalized_status, processed
        FROM dlr_webhooks
        WHERE received_date = $1 AND id = $2 AND provider_id = $3
      `,
      [receivedDate, webhookId, providerId],
    );

    const webhook = result.rows[0];
    if (!webhook || webhook.processed) {
      return;
    }

    const phoneNumber = this.extractFirstString(webhook.payload, ['phoneNumber', 'phone_number', 'to', 'destination']);
    const senderId = this.extractFirstString(webhook.payload, ['senderId', 'sender_id', 'from', 'source']);
    const eventAt = this.extractFirstString(webhook.payload, ['eventAt', 'event_at', 'deliveredAt', 'submitDate', 'sentAt']);
    const bodyText = this.extractFirstString(webhook.payload, ['body', 'text', 'message', 'shortMessage']);
    const bodyHash = this.extractFirstString(webhook.payload, ['bodyHash', 'body_hash'])
      ?? (bodyText ? createHash('sha256').update(bodyText).digest('hex') : undefined);
    const campaignId = this.extractFirstNumber(webhook.payload, ['campaignId', 'campaign_id']);
    const routeRuleId = this.extractFirstNumber(webhook.payload, ['routeRuleId', 'route_rule_id']);

    const message = await this.messagesService.correlateMessageForDlr({
      tenantId: webhook.tenant_id ?? undefined,
      providerId,
      providerMessageId: webhook.provider_message_id ?? undefined,
      phoneNumber,
      senderId,
      eventAt,
      bodyHash,
      campaignId,
      routeRuleId,
    });

    if (!message) {
      this.metricsService.recordDlrEvent('reconciled', webhook.normalized_status ?? 'unknown');
      await this.enqueueReconciliation(webhook, 'message_not_found', {
        phoneNumber,
        senderId,
        eventAt,
        bodyHash,
        campaignId,
        routeRuleId,
      });
      return;
    }

    if (webhook.normalized_status === 'unknown' || !webhook.normalized_status) {
      this.metricsService.recordDlrEvent('reconciled', webhook.normalized_status ?? 'unknown');
      await this.enqueueReconciliation(webhook, 'unknown_status', {
        correlatedMessageId: message.id,
      });
      return;
    }

    if (webhook.normalized_status === 'delivered') {
      if (message.status === 'delivered') {
        this.metricsService.recordDlrEvent('duplicate', 'delivered');
        await this.markProcessed(receivedDate, webhookId, 'duplicate_delivered');
        return;
      }

      if (message.status !== 'provider_accepted') {
        this.metricsService.recordDlrEvent('reconciled', 'delivered');
        await this.enqueueReconciliation(webhook, 'invalid_delivered_transition', {
          correlatedMessageId: message.id,
          currentStatus: message.status,
        });
        return;
      }

      await this.databaseService.withTransaction(async (tx) => {
        const updated = await this.messagesService.transitionMessage(tx, message, 'delivered', {});
        await this.messagesService.logEvent(
          tx,
          { submitDate: message.submit_date, tenantId: message.tenant_id, id: message.id },
          'delivered',
          'provider_accepted',
          'delivered',
          webhook.payload,
          updated.provider_id,
          updated.provider_message_id,
          updated.attempt_count,
        );
        await tx.client.query(
          `
            UPDATE dlr_webhooks
            SET processed = TRUE,
                processed_at = now(),
                tenant_id = COALESCE(tenant_id, $3)
            WHERE received_date = $1 AND id = $2
          `,
          [receivedDate, webhookId, message.tenant_id],
        );
      });
      this.metricsService.recordDlrEvent('processed', 'delivered');
      return;
    }

    if (message.status === 'failed') {
      this.metricsService.recordDlrEvent('duplicate', 'failed');
      await this.markProcessed(receivedDate, webhookId, 'duplicate_failed');
      return;
    }

    if (!['provider_accepted', 'submitting'].includes(message.status)) {
      this.metricsService.recordDlrEvent('reconciled', 'failed');
      await this.enqueueReconciliation(webhook, 'invalid_failed_transition', {
        correlatedMessageId: message.id,
        currentStatus: message.status,
      });
      return;
    }

    await this.databaseService.withTransaction(async (tx) => {
      const updated = await this.messagesService.transitionMessage(tx, message, 'failed', {
        last_error_code: 'dlr_failed',
        last_error_message: 'Provider DLR marked message as failed',
        billing_state: message.billing_state === 'reserved' ? 'released' : message.billing_state,
      });

      if (message.billing_state === 'reserved') {
        await this.messagesService.releaseReservedWallet(
          tx,
          message.tenant_id,
          message.price_minor,
          `release:${message.submit_date}:${message.tenant_id}:${message.id}:dlr`,
          { submitDate: message.submit_date, tenantId: message.tenant_id, id: message.id },
        );
      }

      await this.messagesService.logEvent(
        tx,
        { submitDate: message.submit_date, tenantId: message.tenant_id, id: message.id },
        'failed',
        message.status,
        'failed',
        webhook.payload,
        updated.provider_id,
        updated.provider_message_id,
        updated.attempt_count,
      );

      await tx.client.query(
        `
          UPDATE dlr_webhooks
          SET processed = TRUE,
              processed_at = now(),
              tenant_id = COALESCE(tenant_id, $3)
          WHERE received_date = $1 AND id = $2
        `,
        [receivedDate, webhookId, message.tenant_id],
      );
    });
    this.metricsService.recordDlrEvent('processed', 'failed');
  }
}
