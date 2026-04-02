import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { ApiPrincipal } from './auth.types';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RotateApiKeyDto } from './dto/rotate-api-key.dto';

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  key_prefix: string;
  key_hash: string;
  key_salt: Buffer;
  name: string;
  scopes: string[];
  rate_limit_rps: number | null;
  daily_quota: number | null;
  is_active: boolean;
  expires_at: string | null;
}

@Injectable()
export class AuthService {
  constructor(private readonly databaseService: DatabaseService) {}

  private hashApiKey(apiKey: string, salt: Buffer): string {
    return scryptSync(apiKey, salt, 64).toString('hex');
  }

  private issueApiKeySecret(): { rawKey: string; prefix: string; salt: Buffer; hash: string } {
    const prefix = randomBytes(6).toString('hex');
    const secret = randomBytes(24).toString('base64url');
    const rawKey = `sk_live_${prefix}_${secret}`;
    const salt = randomBytes(16);
    const hash = this.hashApiKey(rawKey, salt);
    return { rawKey, prefix, salt, hash };
  }

  async createApiKey(tenantId: string, dto: CreateApiKeyDto): Promise<Record<string, unknown>> {
    const { rawKey, prefix, salt, hash } = this.issueApiKeySecret();
    const result = await this.databaseService.query<{ id: string; created_at: string }>(
      `
        INSERT INTO api_keys (
          tenant_id,
          key_prefix,
          key_hash,
          key_salt,
          name,
          scopes,
          rate_limit_rps,
          daily_quota,
          expires_at,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
        RETURNING id, created_at
      `,
      [
        tenantId,
        prefix,
        hash,
        salt,
        dto.name,
        JSON.stringify(dto.scopes ?? ['sms:send']),
        dto.rateLimitRps ?? null,
        dto.dailyQuota ?? null,
        dto.expiresInDays ? new Date(Date.now() + (dto.expiresInDays * 24 * 60 * 60 * 1000)) : null,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new UnauthorizedException('Unable to create API key');
    }

    return {
      id: row.id,
      apiKey: rawKey,
      keyPrefix: prefix,
      createdAt: row.created_at,
    };
  }

  async listApiKeys(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: string;
      key_prefix: string;
      name: string;
      scopes: string[];
      rate_limit_rps: number | null;
      daily_quota: number | null;
      is_active: boolean;
      last_used_at: string | null;
      created_at: string;
    }>(
      `
        SELECT id, key_prefix, name, scopes, rate_limit_rps, daily_quota, is_active, last_used_at, created_at
        FROM api_keys
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      keyPrefix: row.key_prefix,
      name: row.name,
      scopes: row.scopes,
      rateLimitRps: row.rate_limit_rps,
      dailyQuota: row.daily_quota,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    }));
  }

  async rotateApiKey(tenantId: string, apiKeyId: string, dto: RotateApiKeyDto): Promise<Record<string, unknown>> {
    const existing = await this.databaseService.query<{ id: string }>(
      'SELECT id FROM api_keys WHERE id = $1 AND tenant_id = $2',
      [apiKeyId, tenantId],
    );

    if (existing.rowCount === 0) {
      throw new NotFoundException('API key not found');
    }

    await this.databaseService.query(
      'UPDATE api_keys SET is_active = FALSE, last_rotated_at = now() WHERE id = $1',
      [apiKeyId],
    );

    return this.createApiKey(tenantId, {
      name: dto.name ?? 'Rotated key',
      scopes: dto.scopes,
    });
  }

  async disableApiKey(tenantId: string, apiKeyId: string): Promise<void> {
    const result = await this.databaseService.query(
      'UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND tenant_id = $2',
      [apiKeyId, tenantId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('API key not found');
    }
  }

  async validateApiKey(apiKey: string): Promise<ApiPrincipal> {
    const segments = apiKey.split('_');
    if (segments.length < 4) {
      throw new UnauthorizedException('Malformed API key');
    }

    const prefix = segments[2];
    const result = await this.databaseService.query<ApiKeyRow>(
      `
        SELECT id, tenant_id, key_prefix, key_hash, key_salt, name, scopes, rate_limit_rps, daily_quota, is_active, expires_at
        FROM api_keys
        WHERE key_prefix = $1
        LIMIT 1
      `,
      [prefix],
    );

    const row = result.rows[0];

    if (!row || !row.is_active) {
      throw new UnauthorizedException('API key is not active');
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException('API key has expired');
    }

    const computed = Buffer.from(this.hashApiKey(apiKey, row.key_salt), 'hex');
    const stored = Buffer.from(row.key_hash, 'hex');

    if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.databaseService.query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [row.id]);

    return {
      apiKeyId: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      scopes: row.scopes,
      rateLimitRps: row.rate_limit_rps,
      dailyQuota: row.daily_quota,
    };
  }
}
