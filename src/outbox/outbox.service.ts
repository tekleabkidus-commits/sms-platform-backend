import { Injectable } from '@nestjs/common';
import { DatabaseService, TransactionContext } from '../database/database.service';

export interface OutboxEventInput {
  tenantId?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  topicName: string;
  partitionKey: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  nextAttemptAt?: Date;
}

@Injectable()
export class OutboxService {
  constructor(private readonly databaseService: DatabaseService) {}

  async enqueue(event: OutboxEventInput, tx?: TransactionContext): Promise<void> {
    if (tx) {
      await tx.client.query(
        `
          INSERT INTO outbox_events (
            tenant_id,
            aggregate_type,
            aggregate_id,
            event_type,
            topic_name,
            partition_key,
            dedupe_key,
            payload,
            status,
            next_attempt_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
          ON CONFLICT (event_date, dedupe_key) DO NOTHING
        `,
        [
          event.tenantId ?? null,
          event.aggregateType,
          event.aggregateId,
          event.eventType,
          event.topicName,
          event.partitionKey,
          event.dedupeKey,
          JSON.stringify(event.payload),
          event.nextAttemptAt ?? new Date(),
        ],
      );
      return;
    }

    await this.databaseService.query(
      `
        INSERT INTO outbox_events (
          tenant_id,
          aggregate_type,
          aggregate_id,
          event_type,
          topic_name,
          partition_key,
          dedupe_key,
          payload,
          status,
          next_attempt_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
        ON CONFLICT (event_date, dedupe_key) DO NOTHING
      `,
      [
        event.tenantId ?? null,
        event.aggregateType,
        event.aggregateId,
        event.eventType,
        event.topicName,
        event.partitionKey,
        event.dedupeKey,
        JSON.stringify(event.payload),
        event.nextAttemptAt ?? new Date(),
      ],
    );
  }
}
