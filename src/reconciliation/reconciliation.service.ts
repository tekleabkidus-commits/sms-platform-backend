import { Injectable, OnModuleInit } from '@nestjs/common';
import { MetricsService } from '../common/metrics/metrics.service';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopics } from '../kafka/kafka-topics';
import { DatabaseService } from '../database/database.service';
import { RuntimeRoleService } from '../runtime/runtime-role.service';

interface ReconciliationPayload {
  tenantId?: string;
  providerId?: number;
  submitDate?: string;
  messageId?: number;
  kind: string;
  reason: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class ReconciliationService implements OnModuleInit {
  constructor(
    private readonly kafkaService: KafkaService,
    private readonly databaseService: DatabaseService,
    private readonly runtimeRoleService: RuntimeRoleService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.runtimeRoleService.hasCapability('reconciliationConsumer')) {
      return;
    }
    await this.kafkaService.subscribe(KafkaTopics.SmsReconcile, 'sms-reconciliation', async ({ value }) => {
      const message = JSON.parse(value) as ReconciliationPayload;
      await this.databaseService.query(
        `
          INSERT INTO reconciliation_events (
            event_date,
            tenant_id,
            provider_id,
            message_submit_date,
            message_id,
            kind,
            reason,
            payload,
            status
          )
          VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, 'pending')
        `,
        [
          message.tenantId ?? null,
          message.providerId ?? null,
          message.submitDate ?? null,
          message.messageId ?? null,
          message.kind,
          message.reason,
          JSON.stringify(message.payload),
        ],
      );
      this.metricsService.recordRetry('queued', 'reconciliation_event');
    });
  }
}
