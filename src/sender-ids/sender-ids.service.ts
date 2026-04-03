import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateSenderIdDto } from './dto/create-sender-id.dto';

interface SenderIdRow {
  id: number;
  tenant_id: string;
  provider_id: number;
  sender_name: string;
  status: string;
  created_at: string;
  rejection_reason?: string | null;
  approved_at?: string | null;
}

@Injectable()
export class SenderIdsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(tenantId: string, dto: CreateSenderIdDto): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<SenderIdRow>(
      `
        INSERT INTO sender_ids (tenant_id, provider_id, sender_name, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING id, tenant_id, provider_id, sender_name, status, created_at
      `,
      [tenantId, dto.providerId, dto.senderName],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Unable to create sender ID');
    }
    return this.toResponse(row);
  }

  async list(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<SenderIdRow>(
      `
        SELECT id, tenant_id, provider_id, sender_name, status, rejection_reason, approved_at, created_at
        FROM sender_ids
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
      [tenantId],
    );
    return result.rows.map((row) => this.toResponse(row));
  }

  async ensureApproved(tenantId: string, senderName: string, providerId?: number): Promise<void> {
    const result = await this.databaseService.query<{ status: string }>(
      `
        SELECT status
        FROM sender_ids
        WHERE tenant_id = $1
          AND sender_name = $2
          AND ($3::bigint IS NULL OR provider_id = $3)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId, senderName, providerId ?? null],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Sender ID not registered');
    }
    if (row.status !== 'approved') {
      throw new ForbiddenException(`Sender ID is not approved: ${row.status}`);
    }
  }

  async approve(id: number): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<SenderIdRow>(
      `
        UPDATE sender_ids
        SET status = 'approved',
            rejection_reason = NULL,
            approved_at = now(),
            updated_at = now()
        WHERE id = $1
        RETURNING id, tenant_id, provider_id, sender_name, status, rejection_reason, approved_at, created_at
      `,
      [id],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Sender ID not found');
    }

    return this.toResponse(row);
  }

  async reject(id: number, reason?: string): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<SenderIdRow>(
      `
        UPDATE sender_ids
        SET status = 'rejected',
            rejection_reason = $2,
            approved_at = NULL,
            updated_at = now()
        WHERE id = $1
        RETURNING id, tenant_id, provider_id, sender_name, status, rejection_reason, approved_at, created_at
      `,
      [id, reason ?? 'Rejected during review'],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Sender ID not found');
    }

    return this.toResponse(row);
  }

  private toResponse(row: SenderIdRow): Record<string, unknown> {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      providerId: row.provider_id,
      senderName: row.sender_name,
      status: row.status,
      rejectionReason: row.rejection_reason ?? null,
      approvedAt: row.approved_at ?? null,
      createdAt: row.created_at,
    };
  }
}
