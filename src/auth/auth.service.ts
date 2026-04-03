import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../common/metrics/metrics.service';
import { DatabaseService } from '../database/database.service';
import { ApiPrincipal, JwtClaims, ReauthClaims } from './auth.types';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { LoginDto } from './dto/login.dto';
import { ReauthDto } from './dto/reauth.dto';
import { RotateApiKeyDto } from './dto/rotate-api-key.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { canUseCrossTenantScope } from '../common/utils/tenant-scope';

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

interface UserLoginRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  tenant_code: string;
  tenant_name: string;
  tenant_timezone: string;
  tenant_status: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  private hashApiKey(apiKey: string, salt: Buffer): string {
    return scryptSync(apiKey, salt, 64).toString('hex');
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    const [algorithm, saltValue, digest] = storedHash.split('$');
    if (algorithm !== 'scrypt' || !saltValue || !digest) {
      throw new ConflictException('Unsupported password hash format');
    }

    const computed = scryptSync(password, Buffer.from(saltValue, 'base64url'), 64).toString('hex');
    const computedBuffer = Buffer.from(computed, 'hex');
    const storedBuffer = Buffer.from(digest, 'hex');
    return computedBuffer.length === storedBuffer.length && timingSafeEqual(computedBuffer, storedBuffer);
  }

  private async listTenantOptions(user: JwtClaims): Promise<Record<string, unknown>[]> {
    if (!canUseCrossTenantScope(user)) {
      return [];
    }

    const result = await this.databaseService.query<{
      id: string;
      code: string;
      name: string;
      status: string;
      timezone: string;
    }>(
      `
        SELECT id, code, name, status, timezone
        FROM tenants
        WHERE status = 'active'
        ORDER BY name ASC
        LIMIT 200
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      timezone: row.timezone,
    }));
  }

  async login(dto: LoginDto): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<UserLoginRow>(
      `
        SELECT
          u.id,
          u.tenant_id,
          u.email,
          u.password_hash,
          u.role,
          u.is_active,
          t.code AS tenant_code,
          t.name AS tenant_name,
          t.timezone AS tenant_timezone,
          t.status AS tenant_status
        FROM users u
        INNER JOIN tenants t ON t.id = u.tenant_id
        WHERE t.code = $1
          AND LOWER(u.email) = LOWER($2)
        LIMIT 1
      `,
      [dto.tenantCode, dto.email],
    );

    const user = result.rows[0];
    if (!user || !user.is_active || user.tenant_status !== 'active') {
      this.metricsService.recordAuthEvent('login', 'failure');
      throw new UnauthorizedException('Invalid login credentials');
    }

    if (!this.verifyPassword(dto.password, user.password_hash)) {
      this.metricsService.recordAuthEvent('login', 'failure');
      throw new UnauthorizedException('Invalid login credentials');
    }

    const claims: JwtClaims = {
      sub: user.id,
      tenantId: user.tenant_id,
      homeTenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    };

    const expiresIn = '12h';
    const token = await this.jwtService.signAsync(claims, {
      privateKey: this.configService.getOrThrow<string>('auth.jwtPrivateKey'),
      algorithm: 'RS256',
      expiresIn,
    });

    await this.auditService.write({
      tenantId: user.tenant_id,
      userId: user.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      metadata: {
        email: user.email,
      },
    });
    this.metricsService.recordAuthEvent('login', 'success');

    return {
      accessToken: token,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: user.tenant_id,
        code: user.tenant_code,
        name: user.tenant_name,
        timezone: user.tenant_timezone,
        status: user.tenant_status,
      },
    };
  }

  async getCurrentUser(claims: JwtClaims): Promise<Record<string, unknown>> {
    const homeTenantId = claims.homeTenantId ?? claims.tenantId;
    const userResult = await this.databaseService.query<{
      user_id: string;
      email: string;
      role: string;
      is_active: boolean;
    }>(
      `
        SELECT
          u.id AS user_id,
          u.email,
          u.role,
          u.is_active
        FROM users u
        WHERE u.id = $1
          AND u.tenant_id = $2
          AND u.is_active = TRUE
        LIMIT 1
      `,
      [claims.sub, homeTenantId],
    );

    const userRow = userResult.rows[0];
    if (!userRow?.is_active) {
      throw new UnauthorizedException('User session is no longer active');
    }

    const tenantResult = await this.databaseService.query<{
      tenant_id: string;
      tenant_code: string;
      tenant_name: string;
      tenant_timezone: string;
      tenant_status: string;
    }>(
      `
        SELECT
          id AS tenant_id,
          code AS tenant_code,
          name AS tenant_name,
          timezone AS tenant_timezone,
          status AS tenant_status
        FROM tenants
        WHERE id = $1
        LIMIT 1
      `,
      [claims.tenantId],
    );

    const tenantRow = tenantResult.rows[0];
    if (!tenantRow || tenantRow.tenant_status !== 'active') {
      throw new UnauthorizedException('Tenant session is no longer active');
    }

    return {
      user: {
        id: userRow.user_id,
        email: userRow.email,
        role: userRow.role,
      },
      tenant: {
        id: tenantRow.tenant_id,
        code: tenantRow.tenant_code,
        name: tenantRow.tenant_name,
        timezone: tenantRow.tenant_timezone,
        status: tenantRow.tenant_status,
      },
      availableTenants: await this.listTenantOptions(claims),
    };
  }

  async reauthenticate(claims: JwtClaims, dto: ReauthDto): Promise<Record<string, unknown>> {
    const homeTenantId = claims.homeTenantId ?? claims.tenantId;
    const result = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      email: string;
      password_hash: string;
      is_active: boolean;
    }>(
      `
        SELECT id, tenant_id, email, password_hash, is_active
        FROM users
        WHERE id = $1
          AND tenant_id = $2
        LIMIT 1
      `,
      [claims.sub, homeTenantId],
    );

    const user = result.rows[0];
    if (!user?.is_active) {
      this.metricsService.recordAuthEvent('reauth', 'failure');
      throw new UnauthorizedException('User session is no longer active');
    }

    if (!this.verifyPassword(dto.password, user.password_hash)) {
      this.metricsService.recordAuthEvent('reauth', 'failure');
      await this.auditService.write({
        tenantId: claims.tenantId,
        userId: claims.sub,
        action: 'auth.reauth.failed',
        targetType: 'user',
        targetId: claims.sub,
        metadata: {
          reason: 'invalid_password',
        },
      });
      throw new UnauthorizedException('Password confirmation failed');
    }

    const reauthClaims: ReauthClaims = {
      sub: claims.sub,
      tenantId: claims.tenantId,
      homeTenantId,
      role: claims.role,
      email: claims.email,
      kind: 'reauth',
      scope: 'dangerous_action',
      reauthAt: Date.now(),
    };

    const expiresInSeconds = 300;
    const reauthToken = await this.jwtService.signAsync(reauthClaims, {
      privateKey: this.configService.getOrThrow<string>('auth.jwtPrivateKey'),
      algorithm: 'RS256',
      expiresIn: `${expiresInSeconds}s`,
    });

    await this.auditService.write({
      tenantId: claims.tenantId,
      userId: claims.sub,
      action: 'auth.reauth.succeeded',
      targetType: 'user',
      targetId: claims.sub,
      metadata: {
        homeTenantId,
      },
    });
    this.metricsService.recordAuthEvent('reauth', 'success');

    return {
      reauthToken,
      expiresInSeconds,
    };
  }

  async switchTenant(claims: JwtClaims, dto: SwitchTenantDto): Promise<Record<string, unknown>> {
    if (!canUseCrossTenantScope(claims)) {
      throw new UnauthorizedException('Cross-tenant access is not allowed for this role');
    }

    const homeTenantId = claims.homeTenantId ?? claims.tenantId;
    const [userResult, tenantResult] = await Promise.all([
      this.databaseService.query<{
        id: string;
        email: string;
        role: string;
        is_active: boolean;
      }>(
        `
          SELECT id, email, role, is_active
          FROM users
          WHERE id = $1
            AND tenant_id = $2
          LIMIT 1
        `,
        [claims.sub, homeTenantId],
      ),
      this.databaseService.query<{
        id: string;
        code: string;
        name: string;
        timezone: string;
        status: string;
      }>(
        `
          SELECT id, code, name, timezone, status
          FROM tenants
          WHERE id = $1
          LIMIT 1
        `,
        [dto.tenantId],
      ),
    ]);

    const user = userResult.rows[0];
    const tenant = tenantResult.rows[0];
    if (!user?.is_active || !tenant || tenant.status !== 'active') {
      throw new UnauthorizedException('Unable to switch tenant context');
    }

    const nextClaims: JwtClaims = {
      sub: user.id,
      tenantId: tenant.id,
      homeTenantId,
      role: user.role,
      email: user.email,
    };

    const expiresIn = '12h';
    const token = await this.jwtService.signAsync(nextClaims, {
      privateKey: this.configService.getOrThrow<string>('auth.jwtPrivateKey'),
      algorithm: 'RS256',
      expiresIn,
    });

    await this.auditService.write({
      tenantId: tenant.id,
      userId: user.id,
      action: 'auth.switch_tenant',
      targetType: 'tenant',
      targetId: tenant.id,
      metadata: {
        homeTenantId,
        tenantCode: tenant.code,
      },
    });

    return {
      accessToken: token,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        code: tenant.code,
        name: tenant.name,
        timezone: tenant.timezone,
        status: tenant.status,
      },
      availableTenants: await this.listTenantOptions(nextClaims),
    };
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
    const row = await this.databaseService.withTransaction(async (tx) => {
      const result = await tx.client.query<{ id: string; created_at: string }>(
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

      const created = result.rows[0];
      if (!created) {
        throw new UnauthorizedException('Unable to create API key');
      }

      await this.auditService.write({
        tenantId,
        action: 'api_keys.create',
        targetType: 'api_key',
        targetId: created.id,
        metadata: {
          keyPrefix: prefix,
          scopes: dto.scopes ?? ['sms:send'],
          dailyQuota: dto.dailyQuota ?? null,
          rateLimitRps: dto.rateLimitRps ?? null,
        },
      }, tx);

      return created;
    });

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
    const { rawKey, prefix, salt, hash } = this.issueApiKeySecret();
    const response = await this.databaseService.withTransaction(async (tx) => {
      const existing = await tx.client.query<{ id: string }>(
        'SELECT id FROM api_keys WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [apiKeyId, tenantId],
      );

      if (existing.rowCount === 0) {
        throw new NotFoundException('API key not found');
      }

      await tx.client.query(
        'UPDATE api_keys SET is_active = FALSE, last_rotated_at = now() WHERE id = $1',
        [apiKeyId],
      );

      const result = await tx.client.query<{ id: string; created_at: string }>(
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
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, TRUE)
          RETURNING id, created_at
        `,
        [
          tenantId,
          prefix,
          hash,
          salt,
          dto.name ?? 'Rotated key',
          JSON.stringify(dto.scopes ?? ['sms:send']),
        ],
      );

      const rotated = result.rows[0];
      if (!rotated) {
        throw new UnauthorizedException('Unable to rotate API key');
      }

      await this.auditService.write({
        tenantId,
        action: 'api_keys.rotate',
        targetType: 'api_key',
        targetId: rotated.id,
        metadata: {
          previousApiKeyId: apiKeyId,
          keyPrefix: prefix,
          scopes: dto.scopes ?? ['sms:send'],
        },
      }, tx);

      return rotated;
    });

    return {
      id: response.id,
      apiKey: rawKey,
      keyPrefix: prefix,
      createdAt: response.created_at,
    };
  }

  async disableApiKey(tenantId: string, apiKeyId: string): Promise<void> {
    await this.databaseService.withTransaction(async (tx) => {
      const result = await tx.client.query(
        'UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND tenant_id = $2',
        [apiKeyId, tenantId],
      );

      if (result.rowCount === 0) {
        throw new NotFoundException('API key not found');
      }

      await this.auditService.write({
        tenantId,
        action: 'api_keys.disable',
        targetType: 'api_key',
        targetId: apiKeyId,
      }, tx);
    });
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
      this.metricsService.recordAuthEvent('api_key_auth', 'failure');
      throw new UnauthorizedException('API key is not active');
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      this.metricsService.recordAuthEvent('api_key_auth', 'failure');
      throw new UnauthorizedException('API key has expired');
    }

    const computed = Buffer.from(this.hashApiKey(apiKey, row.key_salt), 'hex');
    const stored = Buffer.from(row.key_hash, 'hex');

    if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) {
      this.metricsService.recordAuthEvent('api_key_auth', 'failure');
      throw new UnauthorizedException('Invalid API key');
    }
    this.metricsService.recordAuthEvent('api_key_auth', 'success');

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
