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

  private normalizeStatus(payload: Record<string, unknown>): string {
    const candidates = [
      payload.status,
      payload.deliveryStatus,
      payload.delivery_status,
      payload.message_status,
    ]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toLowerCase());

    if (candidates.some((value) => ['delivered', 'deliverd', 'success'].includes(value))) {
      return 'delivered';
    }
    if (candidates.some((value) => ['failed', 'undelivered', 'rejected', 'expired'].includes(value))) {
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

    await this.databaseService.withTransaction(async (tx) => {
      const insert = await tx.client.query<{ id: number; received_date: string }>(
        `
          INSERT INTO dlr_webhooks (
            received_date,
            provider_id,
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
            FALSE
          )
          RETURNING id, received_date
        `,
        [
          provider.id,
          typeof payload.providerMessageId === 'string' ? payload.providerMessageId : null,
          typeof payload.callbackId === 'string' ? payload.callbackId : null,
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
