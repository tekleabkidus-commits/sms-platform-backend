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
        SELECT id, tenant_id, provider_id, sender_name, status, created_at
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

  private toResponse(row: SenderIdRow): Record<string, unknown> {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      providerId: row.provider_id,
      senderName: row.sender_name,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
