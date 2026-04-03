import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

interface OptOutRow {
  phone_number: string;
  is_active: boolean;
}

@Injectable()
export class ComplianceService {
  constructor(private readonly databaseService: DatabaseService) {}

  normalizePhoneNumber(phoneNumber: string): string {
    const trimmed = phoneNumber.replace(/[^\d+]/g, '');
    if (trimmed.startsWith('+')) {
      return trimmed;
    }
    if (trimmed.startsWith('251')) {
      return `+${trimmed}`;
    }
    if (trimmed.startsWith('0')) {
      return `+251${trimmed.slice(1)}`;
    }
    return trimmed;
  }

  async assertNotOptedOut(tenantId: string, phoneNumber: string): Promise<void> {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    const result = await this.databaseService.query<OptOutRow>(
      `
        SELECT phone_number, is_active
        FROM (
          SELECT phone_number, is_active
          FROM opt_outs
          WHERE tenant_id = $1
            AND phone_number = $2
            AND is_active = TRUE
          UNION ALL
          SELECT phone_number, is_active
          FROM suppression_lists
          WHERE tenant_id = $1
            AND phone_number = $2
            AND is_active = TRUE
        ) blocked_destinations
        LIMIT 1
      `,
      [tenantId, normalized],
    );

    if (result.rows[0]) {
      throw new ForbiddenException('Destination is blocked by opt-out or suppression policy');
    }
  }

  async createOptOut(tenantId: string, phoneNumber: string, reason?: string): Promise<Record<string, unknown>> {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    const result = await this.databaseService.query<{
      id: number;
      phone_number: string;
      reason: string | null;
      created_at: string;
    }>(
      `
        INSERT INTO opt_outs (tenant_id, phone_number, reason, is_active)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (tenant_id, phone_number)
        DO UPDATE SET
          reason = EXCLUDED.reason,
          is_active = TRUE,
          updated_at = now()
        RETURNING id, phone_number, reason, created_at
      `,
      [tenantId, normalized, reason ?? null],
    );

    const row = result.rows[0];
    return {
      id: row?.id,
      phoneNumber: row?.phone_number,
      reason: row?.reason,
      createdAt: row?.created_at,
    };
  }

  async listOptOuts(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: number;
      phone_number: string;
      reason: string | null;
      created_at: string;
    }>(
      `
        SELECT id, phone_number, reason, created_at
        FROM opt_outs
        WHERE tenant_id = $1
          AND is_active = TRUE
        ORDER BY created_at DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  async createSuppression(tenantId: string, phoneNumber: string, reason?: string): Promise<Record<string, unknown>> {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    const result = await this.databaseService.query<{
      id: number;
      phone_number: string;
      reason: string | null;
      created_at: string;
    }>(
      `
        INSERT INTO suppression_lists (tenant_id, phone_number, reason, is_active)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (tenant_id, phone_number)
        DO UPDATE SET
          reason = EXCLUDED.reason,
          is_active = TRUE,
          updated_at = now()
        RETURNING id, phone_number, reason, created_at
      `,
      [tenantId, normalized, reason ?? null],
    );

    const row = result.rows[0];
    return {
      id: row?.id,
      phoneNumber: row?.phone_number,
      reason: row?.reason,
      createdAt: row?.created_at,
    };
  }

  async listSuppressions(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: number;
      phone_number: string;
      reason: string | null;
      created_at: string;
    }>(
      `
        SELECT id, phone_number, reason, created_at
        FROM suppression_lists
        WHERE tenant_id = $1
          AND is_active = TRUE
        ORDER BY created_at DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }
}
