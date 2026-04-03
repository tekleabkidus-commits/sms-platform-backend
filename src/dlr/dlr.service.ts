import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OutboxService } from '../outbox/outbox.service';
import { KafkaTopics } from '../kafka/kafka-topics';

@Injectable()
export class DlrService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly outboxService: OutboxService,
  ) {}

  private extractFirstString(payload: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return null;
  }

  private normalizeStatus(payload: Record<string, unknown>): string {
    const candidates = [
      payload.status,
      payload.deliveryStatus,
      payload.delivery_status,
      payload.message_status,
      payload.state,
    ]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toLowerCase());

    if (candidates.some((value) => ['delivered', 'deliverd', 'success', 'successdelivrd'].includes(value))) {
      return 'delivered';
    }
    if (candidates.some((value) => ['failed', 'undelivered', 'rejected', 'expired', 'deleted'].includes(value))) {
      return 'failed';
    }
    return 'unknown';
  }

  async acceptWebhook(
    providerCode: string,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ accepted: true }> {
    const providerResult = await this.databaseService.query<{ id: number }>(
      'SELECT id FROM providers WHERE code = $1 LIMIT 1',
      [providerCode],
    );
    const provider = providerResult.rows[0];
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    const providerMessageId = this.extractFirstString(payload, ['providerMessageId', 'provider_message_id', 'messageId', 'message_id']);
    const callbackId = this.extractFirstString(payload, ['callbackId', 'callback_id', 'eventId', 'event_id'])
      ?? (typeof headers['x-request-id'] === 'string' ? headers['x-request-id'] : null);
    const tenantId = this.extractFirstString(payload, ['tenantId', 'tenant_id']);

    await this.databaseService.withTransaction(async (tx) => {
      const insert = await tx.client.query<{ id: number; received_date: string }>(
        `
          INSERT INTO dlr_webhooks (
            received_date,
            provider_id,
            tenant_id,
            provider_message_id,
            callback_id,
            headers,
            payload,
            normalized_status,
            processed
          )
          VALUES (
            CURRENT_DATE,
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            FALSE
          )
          ON CONFLICT (received_date, provider_id, callback_id)
          WHERE callback_id IS NOT NULL
          DO UPDATE SET
            tenant_id = COALESCE(dlr_webhooks.tenant_id, EXCLUDED.tenant_id),
            provider_message_id = COALESCE(EXCLUDED.provider_message_id, dlr_webhooks.provider_message_id),
            headers = EXCLUDED.headers,
            payload = EXCLUDED.payload,
            normalized_status = EXCLUDED.normalized_status
          RETURNING id, received_date
        `,
        [
          provider.id,
          tenantId,
          providerMessageId,
          callbackId,
          JSON.stringify(headers),
          JSON.stringify(payload),
          this.normalizeStatus(payload),
        ],
      );

      const row = insert.rows[0];
      if (!row) {
        throw new NotFoundException('Unable to persist DLR webhook');
      }
      await this.outboxService.enqueue({
        tenantId: tenantId ?? undefined,
        aggregateType: 'dlr_webhook',
        aggregateId: `${row.received_date}:${row.id}`,
        eventType: 'dlr.received',
        topicName: KafkaTopics.SmsDlr,
        partitionKey: String(provider.id),
        dedupeKey: `dlr:${row.received_date}:${row.id}`,
        payload: {
          receivedDate: row.received_date,
          webhookId: row.id,
          providerId: provider.id,
        },
      }, tx);
    });

    return { accepted: true };
  }
}
