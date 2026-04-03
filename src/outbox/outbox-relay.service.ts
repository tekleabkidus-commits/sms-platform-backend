import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../common/metrics/metrics.service';
import { DatabaseService } from '../database/database.service';
import { KafkaService } from '../kafka/kafka.service';
import { RuntimeRoleService } from '../runtime/runtime-role.service';

interface PendingOutboxRow {
  event_date: string;
  id: number;
  topic_name: string;
  partition_key: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly batchSize: number;
  private readonly publishLeaseSeconds: number;
  private timer?: NodeJS.Timeout;

  constructor(
    configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly kafkaService: KafkaService,
    private readonly runtimeRoleService: RuntimeRoleService,
    private readonly metricsService: MetricsService,
  ) {
    this.batchSize = configService.getOrThrow<number>('outbox.batchSize');
    this.publishLeaseSeconds = configService.getOrThrow<number>('outbox.publishLeaseSeconds');
  }

  onModuleInit(): void {
    if (!this.runtimeRoleService.hasCapability('outboxRelay')) {
      return;
    }
    this.timer = setInterval(() => {
      void this.flushBatch();
    }, 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async flushBatch(): Promise<void> {
    const rows = await this.databaseService.withTransaction(async ({ client }) => {
      await client.query(
        `
          UPDATE outbox_events
          SET status = 'pending'
          WHERE status = 'publishing'
            AND next_attempt_at <= now()
        `,
      );

      const selected = await client.query<PendingOutboxRow>(
        `
          SELECT event_date, id, topic_name, partition_key, payload, retry_count
          FROM outbox_events
          WHERE status = 'pending'
            AND next_attempt_at <= now()
          ORDER BY created_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [this.batchSize],
      );

      if (selected.rowCount === 0) {
        return [];
      }

      for (const row of selected.rows) {
        await client.query(
          `
            UPDATE outbox_events
            SET status = 'publishing',
                next_attempt_at = now() + make_interval(secs => $3)
            WHERE event_date = $1 AND id = $2
          `,
          [row.event_date, row.id, this.publishLeaseSeconds],
        );
      }

      return selected.rows;
    });

    for (const row of rows) {
      try {
        await this.kafkaService.publish({
          topic: row.topic_name,
          messages: [{
            key: row.partition_key,
            value: JSON.stringify(row.payload),
          }],
        });

        await this.databaseService.query(
          `
            UPDATE outbox_events
            SET status = 'published', processed_at = now()
            WHERE event_date = $1 AND id = $2
          `,
          [row.event_date, row.id],
        );
        this.metricsService.setOutboxBacklog('pending', 0);
      } catch (error) {
        this.logger.error(`Failed to publish outbox event ${row.id}`, error instanceof Error ? error.stack : undefined);
        await this.databaseService.query(
          `
            UPDATE outbox_events
            SET status = CASE WHEN retry_count + 1 >= 10 THEN 'failed' ELSE 'pending' END,
                retry_count = retry_count + 1,
                next_attempt_at = now() + make_interval(secs => LEAST(300, GREATEST(5, (retry_count + 1) * 5))),
                last_error = $3
            WHERE event_date = $1 AND id = $2
          `,
          [row.event_date, row.id, error instanceof Error ? error.message : 'unknown error'],
        );
        if (row.retry_count + 1 >= 10) {
          this.metricsService.setOutboxBacklog('failed', 1);
        }
      }
    }
  }
}
