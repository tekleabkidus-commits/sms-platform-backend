import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { CreateContactGroupDto } from './dto/create-contact-group.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { UploadContactsDto } from './dto/upload-contacts.dto';

interface ParsedContactRow {
  rowNumber: number;
  phoneNumber: string;
  name?: string;
  metadata: Record<string, string>;
}

interface ParsedContactError {
  rowNumber: number;
  rawRecord: Record<string, string>;
  errorReason: string;
}

@Injectable()
export class ContactsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private normalizePhoneNumber(phoneNumber: string): string {
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
    throw new BadRequestException('Phone number must be in Ethiopian local format or E.164');
  }

  private parseCsvContent(
    csvContent: string,
    delimiter: string,
  ): { rows: ParsedContactRow[]; errors: ParsedContactError[] } {
    const trimmed = csvContent.trim();
    if (!trimmed) {
      throw new BadRequestException('CSV content is empty');
    }

    const lines = trimmed.split(/\r?\n/);
    if (lines.length > 100_001) {
      throw new BadRequestException('Inline upload exceeds 100000 data rows');
    }

    const headers = lines[0]?.split(delimiter).map((value) => value.trim()) ?? [];
    if (headers.length === 0) {
      throw new BadRequestException('CSV header is missing');
    }

    const phoneIndex = headers.findIndex((header) => ['phone_number', 'phoneNumber', 'msisdn'].includes(header));
    const nameIndex = headers.findIndex((header) => ['name', 'full_name'].includes(header));
    if (phoneIndex < 0) {
      throw new BadRequestException('CSV must include a phone_number column');
    }

    const rows: ParsedContactRow[] = [];
    const errors: ParsedContactError[] = [];
    const seen = new Set<string>();

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const rawLine = lines[lineIndex];
      if (!rawLine || rawLine.trim().length === 0) {
        continue;
      }

      const columns = rawLine.split(delimiter).map((value) => value.trim());
      const rawRecord = Object.fromEntries(headers.map((header, index) => [header, columns[index] ?? '']));

      try {
        const normalizedPhone = this.normalizePhoneNumber(columns[phoneIndex] ?? '');
        if (seen.has(normalizedPhone)) {
          errors.push({
            rowNumber: lineIndex + 1,
            rawRecord,
            errorReason: 'duplicate_in_upload',
          });
          continue;
        }

        seen.add(normalizedPhone);
        const metadata = Object.fromEntries(
          headers
            .filter((header, index) => index !== phoneIndex && index !== nameIndex)
            .map((header, index) => {
              const sourceIndex = headers.findIndex((candidate) => candidate === header);
              return [header, columns[sourceIndex] ?? ''];
            }),
        );

        rows.push({
          rowNumber: lineIndex + 1,
          phoneNumber: normalizedPhone,
          name: nameIndex >= 0 ? columns[nameIndex] ?? undefined : undefined,
          metadata,
        });
      } catch (error) {
        errors.push({
          rowNumber: lineIndex + 1,
          rawRecord,
          errorReason: error instanceof Error ? error.message : 'invalid_row',
        });
      }
    }

    return { rows, errors };
  }

  async createContact(tenantId: string, dto: CreateContactDto): Promise<Record<string, unknown>> {
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);
    const result = await this.databaseService.query<{
      id: number;
      tenant_id: string;
      phone_number: string;
      name: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(
      `
        INSERT INTO contacts (tenant_id, phone_number, name, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, phone_number)
        DO UPDATE SET
          name = COALESCE(EXCLUDED.name, contacts.name),
          metadata = contacts.metadata || EXCLUDED.metadata,
          updated_at = now()
        RETURNING id, tenant_id, phone_number, name, metadata, created_at, updated_at
      `,
      [tenantId, phoneNumber, dto.name ?? null, JSON.stringify(dto.metadata ?? {})],
    );

    const row = result.rows[0];
    return {
      id: row?.id,
      tenantId: row?.tenant_id,
      phoneNumber: row?.phone_number,
      name: row?.name,
      metadata: row?.metadata ?? {},
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
    };
  }

  async listContacts(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: number;
      phone_number: string;
      name: string | null;
      metadata: Record<string, unknown>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, phone_number, name, metadata, is_active, created_at, updated_at
        FROM contacts
        WHERE tenant_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 500
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
      name: row.name,
      metadata: row.metadata ?? {},
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getContact(tenantId: string, contactId: number): Promise<Record<string, unknown>> {
    const [contact, groups] = await Promise.all([
      this.databaseService.query<{
        id: number;
        phone_number: string;
        name: string | null;
        metadata: Record<string, unknown>;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT id, phone_number, name, metadata, is_active, created_at, updated_at
          FROM contacts
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
        [tenantId, contactId],
      ),
      this.databaseService.query<{ id: number; name: string }>(
        `
          SELECT cg.id, cg.name
          FROM contact_group_members cgm
          INNER JOIN contact_groups cg ON cg.id = cgm.group_id
          INNER JOIN contacts c ON c.id = cgm.contact_id
          WHERE c.tenant_id = $1 AND c.id = $2
          ORDER BY cg.name ASC
        `,
        [tenantId, contactId],
      ),
    ]);

    const row = contact.rows[0];
    if (!row) {
      throw new NotFoundException('Contact not found');
    }

    return {
      id: row.id,
      phoneNumber: row.phone_number,
      name: row.name,
      metadata: row.metadata ?? {},
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      groups: groups.rows.map((group) => ({
        id: group.id,
        name: group.name,
      })),
    };
  }

  async updateContact(tenantId: string, contactId: number, dto: UpdateContactDto): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<{
      id: number;
      phone_number: string;
      name: string | null;
      metadata: Record<string, unknown>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `
        UPDATE contacts
        SET
          name = COALESCE($3, name),
          metadata = CASE
            WHEN $4::jsonb IS NULL THEN metadata
            ELSE metadata || $4::jsonb
          END,
          updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, phone_number, name, metadata, is_active, created_at, updated_at
      `,
      [tenantId, contactId, dto.name ?? null, dto.metadata ? JSON.stringify(dto.metadata) : null],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Contact not found');
    }

    return {
      id: row.id,
      phoneNumber: row.phone_number,
      name: row.name,
      metadata: row.metadata ?? {},
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createGroup(tenantId: string, dto: CreateContactGroupDto): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<{ id: number; name: string; created_at: string }>(
      `
        INSERT INTO contact_groups (tenant_id, name)
        VALUES ($1, $2)
        RETURNING id, name, created_at
      `,
      [tenantId, dto.name],
    );

    const row = result.rows[0];
    return {
      id: row?.id,
      name: row?.name,
      createdAt: row?.created_at,
    };
  }

  async listGroups(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: number;
      name: string;
      created_at: string;
      member_count: string;
    }>(
      `
        SELECT
          cg.id,
          cg.name,
          cg.created_at,
          COUNT(cgm.contact_id)::text AS member_count
        FROM contact_groups cg
        LEFT JOIN contact_group_members cgm ON cgm.group_id = cg.id
        WHERE cg.tenant_id = $1
        GROUP BY cg.id, cg.name, cg.created_at
        ORDER BY cg.created_at DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      memberCount: Number(row.member_count),
      createdAt: row.created_at,
    }));
  }

  async getGroupDetail(tenantId: string, groupId: number): Promise<Record<string, unknown>> {
    const [group, members] = await Promise.all([
      this.databaseService.query<{
        id: number;
        name: string;
        created_at: string;
      }>(
        `
          SELECT id, name, created_at
          FROM contact_groups
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
        [tenantId, groupId],
      ),
      this.databaseService.query<{
        id: number;
        phone_number: string;
        name: string | null;
        created_at: string;
      }>(
        `
          SELECT c.id, c.phone_number, c.name, c.created_at
          FROM contact_group_members cgm
          INNER JOIN contacts c ON c.id = cgm.contact_id
          WHERE cgm.group_id = $1
          ORDER BY c.created_at DESC
          LIMIT 500
        `,
        [groupId],
      ),
    ]);

    const row = group.rows[0];
    if (!row) {
      throw new NotFoundException('Contact group not found');
    }

    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      members: members.rows.map((member) => ({
        id: member.id,
        phoneNumber: member.phone_number,
        name: member.name,
        createdAt: member.created_at,
      })),
    };
  }

  async listUploads(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: number;
      target_group_id: number | null;
      original_file_name: string;
      status: string;
      total_rows: string;
      valid_rows: string;
      invalid_rows: string;
      created_at: string;
      completed_at: string | null;
    }>(
      `
        SELECT id, target_group_id, original_file_name, status, total_rows, valid_rows, invalid_rows, created_at, completed_at
        FROM contact_uploads
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      targetGroupId: row.target_group_id,
      originalFileName: row.original_file_name,
      status: row.status,
      totalRows: Number(row.total_rows),
      validRows: Number(row.valid_rows),
      invalidRows: Number(row.invalid_rows),
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }

  async listUploadErrors(tenantId: string, uploadId: number): Promise<Record<string, unknown>[]> {
    const upload = await this.databaseService.query<{ id: number }>(
      'SELECT id FROM contact_uploads WHERE tenant_id = $1 AND id = $2 LIMIT 1',
      [tenantId, uploadId],
    );
    if (!upload.rows[0]) {
      throw new NotFoundException('Contact upload not found');
    }

    const result = await this.databaseService.query<{
      id: number;
      row_number: string;
      raw_record: Record<string, unknown>;
      error_reason: string;
      created_at: string;
    }>(
      `
        SELECT id, row_number, raw_record, error_reason, created_at
        FROM contact_upload_errors
        WHERE contact_upload_id = $1
        ORDER BY row_number ASC
      `,
      [uploadId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      rowNumber: Number(row.row_number),
      rawRecord: row.raw_record,
      errorReason: row.error_reason,
      createdAt: row.created_at,
    }));
  }

  async importInlineCsv(tenantId: string, dto: UploadContactsDto): Promise<Record<string, unknown>> {
    const delimiter = dto.delimiter ?? ',';
    const parsed = this.parseCsvContent(dto.csvContent, delimiter);

    if (dto.targetGroupId) {
      const group = await this.databaseService.query<{ id: number }>(
        'SELECT id FROM contact_groups WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [dto.targetGroupId, tenantId],
      );
      if (!group.rows[0]) {
        throw new NotFoundException('Target group not found');
      }
    }

    return this.databaseService.withTransaction(async (tx) => {
      const upload = await tx.client.query<{ id: number; created_at: string }>(
        `
          INSERT INTO contact_uploads (
            tenant_id,
            target_group_id,
            storage_uri,
            original_file_name,
            status,
            total_rows,
            valid_rows,
            invalid_rows,
            metadata
          )
          VALUES ($1, $2, $3, $4, 'importing', 0, 0, 0, $5)
          RETURNING id, created_at
        `,
        [
          tenantId,
          dto.targetGroupId ?? null,
          `inline://${Date.now()}-${dto.fileName}`,
          dto.fileName,
          JSON.stringify({ delimiter }),
        ],
      );

      const uploadRow = upload.rows[0];
      if (!uploadRow) {
        throw new BadRequestException('Unable to create contact upload record');
      }

      for (const error of parsed.errors) {
        await tx.client.query(
          `
            INSERT INTO contact_upload_errors (
              contact_upload_id,
              row_number,
              raw_record,
              error_reason
            )
            VALUES ($1, $2, $3, $4)
          `,
          [uploadRow.id, error.rowNumber, JSON.stringify(error.rawRecord), error.errorReason],
        );
      }

      let validRows = 0;
      for (const row of parsed.rows) {
        const contactResult = await tx.client.query<{ id: number }>(
          `
            INSERT INTO contacts (tenant_id, phone_number, name, metadata, source)
            VALUES ($1, $2, $3, $4, 'upload')
            ON CONFLICT (tenant_id, phone_number)
            DO UPDATE SET
              name = COALESCE(EXCLUDED.name, contacts.name),
              metadata = contacts.metadata || EXCLUDED.metadata,
              updated_at = now()
            RETURNING id
          `,
          [tenantId, row.phoneNumber, row.name ?? null, JSON.stringify(row.metadata)],
        );

        const contact = contactResult.rows[0];
        if (!contact) {
          continue;
        }

        if (dto.targetGroupId) {
          await tx.client.query(
            `
              INSERT INTO contact_group_members (group_id, contact_id)
              VALUES ($1, $2)
              ON CONFLICT (group_id, contact_id) DO NOTHING
            `,
            [dto.targetGroupId, contact.id],
          );
        }

        validRows += 1;
      }

      await tx.client.query(
        `
          UPDATE contact_uploads
          SET status = 'completed',
              total_rows = $2,
              valid_rows = $3,
              invalid_rows = $4,
              completed_at = now()
          WHERE id = $1
        `,
        [uploadRow.id, parsed.rows.length + parsed.errors.length, validRows, parsed.errors.length],
      );

      return {
        uploadId: uploadRow.id,
        fileName: dto.fileName,
        totalRows: parsed.rows.length + parsed.errors.length,
        validRows,
        invalidRows: parsed.errors.length,
        groupId: dto.targetGroupId ?? null,
        createdAt: uploadRow.created_at,
      };
    });
  }
}
