import { Injectable } from '@nestjs/common';
import { JwtClaims } from '../auth/auth.types';
import { canUseCrossTenantScope, resolveTenantScope } from '../common/utils/tenant-scope';
import { DatabaseService } from '../database/database.service';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';

type SearchItem = {
  id: string;
  entityType: string;
  title: string;
  subtitle: string;
  href?: string;
  tenantId?: string | null;
  tenantName?: string | null;
  action?: 'switch-tenant';
  actionPayload?: Record<string, unknown>;
};

@Injectable()
export class SearchService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async searchMessages(tenantId: string, q: string, limit: number): Promise<SearchItem[]> {
    const result = await this.databaseService.query<{
      id: number;
      submit_date: string;
      tenant_id: string;
      phone_number: string;
      status: string;
      provider_message_id: string | null;
      accepted_at: string;
    }>(
      `
        SELECT id, submit_date, tenant_id, phone_number, status, provider_message_id, accepted_at
        FROM messages
        WHERE tenant_id = $1
          AND (
            CAST(id AS text) = $2
            OR provider_message_id ILIKE $3
            OR phone_number ILIKE $3
          )
        ORDER BY accepted_at DESC
        LIMIT $4
      `,
      [tenantId, q, `%${q}%`, limit],
    );

    return result.rows.map((row) => ({
      id: `message:${row.submit_date}:${row.tenant_id}:${row.id}`,
      entityType: 'message',
      title: `Message #${row.id}`,
      subtitle: `${row.phone_number} · ${row.status}${row.provider_message_id ? ` · ${row.provider_message_id}` : ''}`,
      href: `/messages/${row.submit_date}/${row.tenant_id}/${row.id}`,
      tenantId: row.tenant_id,
    }));
  }

  private async searchCampaigns(tenantId: string, q: string, limit: number): Promise<SearchItem[]> {
    const result = await this.databaseService.query<{
      id: number;
      name: string;
      status: string;
      scheduled_at: string | null;
    }>(
      `
        SELECT id, name, status, scheduled_at
        FROM campaigns
        WHERE tenant_id = $1
          AND (
            CAST(id AS text) = $2
            OR name ILIKE $3
          )
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [tenantId, q, `%${q}%`, limit],
    );

    return result.rows.map((row) => ({
      id: `campaign:${row.id}`,
      entityType: 'campaign',
      title: row.name,
      subtitle: `${row.status}${row.scheduled_at ? ` · ${row.scheduled_at}` : ''}`,
      href: `/campaigns/${row.id}`,
      tenantId,
    }));
  }

  private async searchSenderIds(tenantId: string, q: string, limit: number): Promise<SearchItem[]> {
    const result = await this.databaseService.query<{
      id: number;
      sender_name: string;
      status: string;
      provider_id: number;
    }>(
      `
        SELECT id, sender_name, status, provider_id
        FROM sender_ids
        WHERE tenant_id = $1
          AND (
            CAST(id AS text) = $2
            OR sender_name ILIKE $3
          )
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [tenantId, q, `%${q}%`, limit],
    );

    return result.rows.map((row) => ({
      id: `sender:${row.id}`,
      entityType: 'sender_id',
      title: row.sender_name,
      subtitle: `${row.status} · provider #${row.provider_id}`,
      href: `/sender-ids`,
      tenantId,
    }));
  }

  private async searchApiKeys(user: JwtClaims, tenantId: string, q: string, limit: number): Promise<SearchItem[]> {
    if (!['owner', 'admin', 'developer'].includes(user.role)) {
      return [];
    }

    const result = await this.databaseService.query<{
      id: string;
      name: string;
      key_prefix: string;
      is_active: boolean;
    }>(
      `
        SELECT id, name, key_prefix, is_active
        FROM api_keys
        WHERE tenant_id = $1
          AND (
            name ILIKE $2
            OR key_prefix ILIKE $2
          )
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [tenantId, `%${q}%`, limit],
    );

    return result.rows.map((row) => ({
      id: `api-key:${row.id}`,
      entityType: 'api_key',
      title: row.name,
      subtitle: `${row.key_prefix} · ${row.is_active ? 'active' : 'inactive'}`,
      href: `/developer/api-keys`,
      tenantId,
    }));
  }

  private async searchProviders(user: JwtClaims, q: string, limit: number): Promise<SearchItem[]> {
    if (!['admin', 'support'].includes(user.role)) {
      return [];
    }

    const result = await this.databaseService.query<{
      id: number;
      name: string;
      code: string;
      health_status: string;
    }>(
      `
        SELECT id, name, code, health_status
        FROM providers
        WHERE name ILIKE $1 OR code ILIKE $1 OR CAST(id AS text) = $2
        ORDER BY priority ASC, id ASC
        LIMIT $3
      `,
      [`%${q}%`, q, limit],
    );

    return result.rows.map((row) => ({
      id: `provider:${row.id}`,
      entityType: 'provider',
      title: row.name,
      subtitle: `${row.code} · ${row.health_status}`,
      href: `/admin/providers/${row.id}`,
    }));
  }

  private async searchTenants(user: JwtClaims, q: string, limit: number): Promise<SearchItem[]> {
    if (!canUseCrossTenantScope(user)) {
      return [];
    }

    const result = await this.databaseService.query<{
      id: string;
      code: string;
      name: string;
      timezone: string;
      status: string;
    }>(
      `
        SELECT id, code, name, timezone, status
        FROM tenants
        WHERE status = 'active'
          AND (name ILIKE $1 OR code ILIKE $1 OR id::text = $2)
        ORDER BY name ASC
        LIMIT $3
      `,
      [`%${q}%`, q, limit],
    );

    return result.rows.map((row) => ({
      id: `tenant:${row.id}`,
      entityType: 'tenant',
      title: row.name,
      subtitle: `${row.code} · ${row.timezone}`,
      action: 'switch-tenant',
      actionPayload: { tenantId: row.id },
    }));
  }

  async globalSearch(user: JwtClaims, query: GlobalSearchQueryDto): Promise<Record<string, unknown>> {
    const q = query.q.trim();
    if (q.length < 2) {
      return { groups: [] };
    }

    const tenantId = resolveTenantScope(user, query.tenantId);
    const [messages, campaigns, senderIds, apiKeys, providers, tenants] = await Promise.all([
      this.searchMessages(tenantId, q, query.limit),
      this.searchCampaigns(tenantId, q, query.limit),
      this.searchSenderIds(tenantId, q, query.limit),
      this.searchApiKeys(user, tenantId, q, query.limit),
      this.searchProviders(user, q, query.limit),
      this.searchTenants(user, q, query.limit),
    ]);

    const groups = [
      { type: 'messages', label: 'Messages', items: messages },
      { type: 'campaigns', label: 'Campaigns', items: campaigns },
      { type: 'sender_ids', label: 'Sender IDs', items: senderIds },
      { type: 'api_keys', label: 'API keys', items: apiKeys },
      { type: 'providers', label: 'Providers', items: providers },
      { type: 'tenants', label: 'Tenants', items: tenants },
    ].filter((group) => group.items.length > 0);

    return { groups };
  }
}
