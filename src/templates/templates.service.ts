import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

interface TemplateRow {
  id: number;
  template_key: string;
  tenant_id: string;
  name: string;
  body: string;
  version: number;
  merge_fields: string[];
  is_active: boolean;
  created_at: string;
}

@Injectable()
export class TemplatesService {
  constructor(private readonly databaseService: DatabaseService) {}

  extractMergeFields(body: string): string[] {
    const matches = body.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g);
    return [...new Set(Array.from(matches, (match) => match[1]).filter((value): value is string => Boolean(value)))];
  }

  validateMergeData(body: string, mergeData: Record<string, string | number> = {}): void {
    const fields = this.extractMergeFields(body);
    const missing = fields.filter((field) => mergeData[field] === undefined || mergeData[field] === null);
    if (missing.length > 0) {
      throw new BadRequestException(`Missing merge fields: ${missing.join(', ')}`);
    }
  }

  render(body: string, mergeData: Record<string, string | number> = {}): string {
    this.validateMergeData(body, mergeData);
    return body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, field: string) => {
      const value = mergeData[field];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  async createTemplate(tenantId: string, dto: CreateTemplateDto): Promise<Record<string, unknown>> {
    const mergeFields = this.extractMergeFields(dto.body);
    const current = await this.databaseService.query<{ template_key: string; next_version: number }>(
      `
        SELECT template_key, MAX(version) + 1 AS next_version
        FROM templates
        WHERE tenant_id = $1 AND name = $2
        GROUP BY template_key
      `,
      [tenantId, dto.name],
    );

    const templateKey = current.rows[0]?.template_key ?? null;
    const nextVersion = Number(current.rows[0]?.next_version ?? 1);

    if (dto.isActive) {
      await this.databaseService.query(
        'UPDATE templates SET is_active = FALSE WHERE tenant_id = $1 AND name = $2',
        [tenantId, dto.name],
      );
    }

    const result = await this.databaseService.query<TemplateRow>(
      `
        INSERT INTO templates (
          tenant_id,
          template_key,
          name,
          body,
          version,
          merge_fields,
          is_active
        )
        VALUES ($1, COALESCE($2, gen_random_uuid()), $3, $4, $5, $6, $7)
        RETURNING id, template_key, tenant_id, name, body, version, merge_fields, is_active, created_at
      `,
      [
        tenantId,
        templateKey,
        dto.name,
        dto.body,
        nextVersion,
        JSON.stringify(mergeFields),
        dto.isActive ?? true,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Unable to create template');
    }
    return this.toResponse(row);
  }

  async listTemplates(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<TemplateRow>(
      `
        SELECT DISTINCT ON (template_key)
          id, template_key, tenant_id, name, body, version, merge_fields, is_active, created_at
        FROM templates
        WHERE tenant_id = $1
        ORDER BY template_key, version DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => this.toResponse(row));
  }

  async updateTemplate(tenantId: string, id: number, dto: UpdateTemplateDto): Promise<Record<string, unknown>> {
    const current = await this.databaseService.query<TemplateRow>(
      `
        SELECT id, template_key, tenant_id, name, body, version, merge_fields, is_active, created_at
        FROM templates
        WHERE id = $1 AND tenant_id = $2
      `,
      [id, tenantId],
    );

    const existing = current.rows[0];
    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    const body = dto.body ?? existing.body;
    const name = dto.name ?? existing.name;
    const mergeFields = this.extractMergeFields(body);

    if (dto.isActive ?? true) {
      await this.databaseService.query(
        'UPDATE templates SET is_active = FALSE WHERE tenant_id = $1 AND template_key = $2',
        [tenantId, existing.template_key],
      );
    }

    const result = await this.databaseService.query<TemplateRow>(
      `
        INSERT INTO templates (
          tenant_id,
          template_key,
          name,
          body,
          version,
          merge_fields,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, template_key, tenant_id, name, body, version, merge_fields, is_active, created_at
      `,
      [
        tenantId,
        existing.template_key,
        name,
        body,
        existing.version + 1,
        JSON.stringify(mergeFields),
        dto.isActive ?? true,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Unable to update template');
    }
    return this.toResponse(row);
  }

  async deleteTemplate(tenantId: string, id: number): Promise<void> {
    const result = await this.databaseService.query(
      'DELETE FROM templates WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('Template not found');
    }
  }

  async resolveTemplate(tenantId: string, templateRef: string): Promise<TemplateRow> {
    const [name, versionPart] = templateRef.split('@');
    const version = versionPart ? Number(versionPart) : null;
    const result = await this.databaseService.query<TemplateRow>(
      version
        ? `
          SELECT id, template_key, tenant_id, name, body, version, merge_fields, is_active, created_at
          FROM templates
          WHERE tenant_id = $1 AND name = $2 AND version = $3
          LIMIT 1
        `
        : `
          SELECT id, template_key, tenant_id, name, body, version, merge_fields, is_active, created_at
          FROM templates
          WHERE tenant_id = $1 AND name = $2 AND is_active = TRUE
          ORDER BY version DESC
          LIMIT 1
        `,
      version ? [tenantId, name, version] : [tenantId, name],
    );

    const template = result.rows[0];
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  private toResponse(row: TemplateRow): Record<string, unknown> {
    return {
      id: row.id,
      templateKey: row.template_key,
      tenantId: row.tenant_id,
      name: row.name,
      body: row.body,
      version: row.version,
      mergeFields: row.merge_fields,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }
}
