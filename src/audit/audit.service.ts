import { Injectable } from '@nestjs/common';
import { DatabaseService, TransactionContext } from '../database/database.service';

export interface AuditLogInput {
  tenantId?: string;
  userId?: string;
  apiKeyId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  sourceIp?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly databaseService: DatabaseService) {}

  async write(entry: AuditLogInput, tx?: TransactionContext): Promise<void> {
    if (tx) {
      await tx.client.query(
        `
          INSERT INTO audit_logs (
            tenant_id,
            user_id,
            api_key_id,
            action,
            target_type,
            target_id,
            source_ip,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          entry.tenantId ?? null,
          entry.userId ?? null,
          entry.apiKeyId ?? null,
          entry.action,
          entry.targetType ?? null,
          entry.targetId ?? null,
          entry.sourceIp ?? null,
          JSON.stringify(entry.metadata ?? {}),
        ],
      );
      return;
    }

    await this.databaseService.query(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          api_key_id,
          action,
          target_type,
          target_id,
          source_ip,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        entry.tenantId ?? null,
        entry.userId ?? null,
        entry.apiKeyId ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.sourceIp ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );
  }
}
