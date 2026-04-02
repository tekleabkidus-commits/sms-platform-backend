import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopics } from '../kafka/kafka-topics';
import { MessagesService } from '../messages/messages.service';

interface DlrWebhookRow {
  id: number;
  received_date: string;
  provider_id: number;
  provider_message_id: string | null;
  payload: Record<string, unknown>;
  normalized_status: string | null;
}

@Injectable()
export class DlrProcessorService implements OnModuleInit {
  constructor(
    private readonly kafkaService: KafkaService,
    private readonly databaseService: DatabaseService,
    private readonly messagesService: MessagesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaService.subscribe(KafkaTopics.SmsDlr, 'dlr-processor', async ({ value }) => {
      const payload = JSON.parse(value) as { receivedDate: string; webhookId: number; providerId: number };
      await this.processWebhook(payload.receivedDate, payload.webhookId, payload.providerId);
    });
  }

  private async processWebhook(receivedDate: string, webhookId: number, providerId: number): Promise<void> {
    const result = await this.databaseService.query<DlrWebhookRow>(
      `
        SELECT id, received_date, provider_id, provider_message_id, payload, normalized_status
        FROM dlr_webhooks
        WHERE received_date = $1 AND id = $2 AND provider_id = $3
      `,
      [receivedDate, webhookId, providerId],
    );

    const webhook = result.rows[0];
    if (!webhook) {
      return;
    }

    const phoneNumber = typeof webhook.payload.phoneNumber === 'string'
      ? webhook.payload.phoneNumber
      : typeof webhook.payload.to === 'string'
        ? webhook.payload.to
        : undefined;

    const message = await this.messagesService.correlateMessageForDlr({
      providerId,
      providerMessageId: webhook.provider_message_id ?? undefined,
      phoneNumber,
    });

    if (!message) {
      await this.databaseService.query(
        `
          UPDATE dlr_webhooks
          SET processed = TRUE,
              processing_error = 'message_not_found',
              processed_at = now()
          WHERE received_date = $1 AND id = $2
        `,
        [receivedDate, webhookId],
      );
      return;
    }

    if (webhook.normalized_status === 'unknown') {
      await this.databaseService.query(
        `
          UPDATE dlr_webhooks
          SET processed = TRUE,
              processing_error = 'unknown_status',
              processed_at = now()
          WHERE received_date = $1 AND id = $2
        `,
        [receivedDate, webhookId],
      );
      return;
    }

    await this.databaseService.withTransaction(async (tx) => {
      if (webhook.normalized_status === 'delivered' && message.status === 'provider_accepted') {
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
      }

      if (webhook.normalized_status === 'failed' && ['provider_accepted', 'submitting'].includes(message.status)) {
        const updated = await this.messagesService.transitionMessage(tx, message, 'failed', {
          last_error_code: 'dlr_failed',
          last_error_message: 'Provider DLR marked message as failed',
        });
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
      }

      await tx.client.query(
        `
          UPDATE dlr_webhooks
          SET processed = TRUE,
              processed_at = now()
          WHERE received_date = $1 AND id = $2
        `,
        [receivedDate, webhookId],
      );
    });
  }
}
