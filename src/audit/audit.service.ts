import { Injectable } from '@nestjs/common';
import { JwtClaims } from '../auth/auth.types';
import { resolveTenantScope } from '../common/utils/tenant-scope';
import { DatabaseService, TransactionContext } from '../database/database.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

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

  async list(user: JwtClaims, query: AuditLogQueryDto): Promise<Record<string, unknown>> {
    const tenantId = resolveTenantScope(user, query.tenantId);
    const offset = (query.page - 1) * query.limit;
    const params: unknown[] = [tenantId];
    const filters: string[] = ['tenant_id = $1'];

    if (query.userId) {
      params.push(query.userId);
      filters.push(`user_id = $${params.length}`);
    }
    if (query.apiKeyId) {
      params.push(query.apiKeyId);
      filters.push(`api_key_id = $${params.length}`);
    }
    if (query.action) {
      params.push(`%${query.action}%`);
      filters.push(`action ILIKE $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      filters.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`created_at <= $${params.length}::timestamptz`);
    }

    const [countResult, logs] = await Promise.all([
      this.databaseService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM audit_logs
          WHERE ${filters.join(' AND ')}
        `,
        params,
      ),
      this.databaseService.query<{
        log_date: string;
        id: number;
        tenant_id: string | null;
        user_id: string | null;
        api_key_id: string | null;
        action: string;
        target_type: string | null;
        target_id: string | null;
        source_ip: string | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `
          SELECT log_date, id, tenant_id, user_id, api_key_id, action, target_type, target_id, source_ip::text, metadata, created_at
          FROM audit_logs
          WHERE ${filters.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT $${params.length + 1}
          OFFSET $${params.length + 2}
        `,
        [...params, query.limit, offset],
      ),
    ]);

    return {
      items: logs.rows.map((row) => ({
        logDate: row.log_date,
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        apiKeyId: row.api_key_id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        sourceIp: row.source_ip,
        metadata: row.metadata,
        createdAt: row.created_at,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: Number(countResult.rows[0]?.total ?? 0),
      },
    };
  }
}
