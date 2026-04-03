import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { ProvidersService } from '../providers/providers.service';
import { JwtClaims } from '../auth/auth.types';
import { resolveTenantScope } from '../common/utils/tenant-scope';
import { UpsertPricingRuleDto } from './dto/upsert-pricing-rule.dto';
import { UpsertRetryPolicyDto } from './dto/upsert-retry-policy.dto';
import { UpsertRoutingRuleDto } from './dto/upsert-routing-rule.dto';

interface RoutingRuleRow {
  id: number;
  provider_id: number;
  smpp_config_id: number | null;
  preferred_protocol: 'http' | 'smpp' | null;
  priority: number;
  weight: number;
  cost_rank: number;
  failover_order: number;
  max_tps: number | null;
}

interface PricingRow {
  provider_id: number;
  unit_price_minor: number;
}

export interface RouteDecision {
  routingRuleId: number;
  providerId: number;
  smppConfigId: number | null;
  protocol: 'http' | 'smpp';
  estimatedUnitCostMinor: number;
  score: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  retryIntervals: number[];
  retryOnErrors: string[];
}

export interface RouteSelectionOptions {
  excludedProviderIds?: number[];
  excludedRuleIds?: number[];
  preferProtocol?: 'http' | 'smpp';
  allowOpenCircuitProbe?: boolean;
}

@Injectable()
export class RoutingService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly providersService: ProvidersService,
  ) {}

  private rulesCacheKey(tenantId: string, trafficType: string): string {
    return `routing-rules:${tenantId}:${trafficType}`;
  }

  async getRules(tenantId: string, trafficType: string): Promise<RoutingRuleRow[]> {
    const cacheKey = this.rulesCacheKey(tenantId, trafficType);
    const cached = await this.redisService.getJson<RoutingRuleRow[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.databaseService.query<RoutingRuleRow>(
      `
        SELECT id, provider_id, smpp_config_id, preferred_protocol, priority, weight, cost_rank, failover_order, max_tps
        FROM routing_rules
        WHERE (tenant_id = $1 OR tenant_id IS NULL)
          AND traffic_type = $2
          AND is_active = TRUE
        ORDER BY priority ASC, failover_order ASC
      `,
      [tenantId, trafficType],
    );

    await this.redisService.setJson(cacheKey, result.rows, 60);
    return result.rows;
  }

  async getUnitCosts(providerIds: number[], countryCode: string, trafficType: string): Promise<Map<number, number>> {
    const result = await this.databaseService.query<PricingRow>(
      `
        SELECT provider_id, unit_price_minor
        FROM pricing_rules
        WHERE kind = 'cost'
          AND provider_id = ANY($1)
          AND country_code = $2
          AND traffic_type = $3
          AND is_active = TRUE
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY effective_from DESC
      `,
      [providerIds, countryCode, trafficType],
    );

    const costs = new Map<number, number>();
    for (const row of result.rows) {
      if (!costs.has(row.provider_id)) {
        costs.set(row.provider_id, row.unit_price_minor);
      }
    }
    return costs;
  }

  private normalizeCountryCode(phoneNumber: string): string {
    if (phoneNumber.startsWith('+251')) {
      return 'ET';
    }
    return 'INTL';
  }

  async selectRoute(
    tenantId: string,
    phoneNumber: string,
    trafficType: string,
    options: RouteSelectionOptions = {},
  ): Promise<RouteDecision> {
    const rules = (await this.getRules(tenantId, trafficType)).filter((rule) => {
      if (options.excludedProviderIds?.includes(rule.provider_id)) {
        return false;
      }
      if (options.excludedRuleIds?.includes(rule.id)) {
        return false;
      }
      return true;
    });
    if (rules.length === 0) {
      throw new Error(`No routing rules found for ${tenantId}/${trafficType}`);
    }

    const countryCode = this.normalizeCountryCode(phoneNumber);
    const unitCosts = await this.getUnitCosts(
      rules.map((rule) => rule.provider_id),
      countryCode,
      trafficType,
    );

    const candidates = (await Promise.all(rules.map(async (rule) => {
      const metrics = await this.providersService.getProviderMetrics(rule.provider_id);
      if (metrics.circuitState === 'open' && !options.allowOpenCircuitProbe) {
        return null;
      }
      const protocol = rule.preferred_protocol ?? (rule.smpp_config_id ? 'smpp' : 'http');
      const cost = unitCosts.get(rule.provider_id) ?? 0;
      const trafficBoost = trafficType === 'otp' ? (protocol === 'smpp' ? 10 : 0) : 0;
      const preferredProtocolBoost = options.preferProtocol === protocol ? 5 : 0;
      const healthPenalty = metrics.circuitState === 'half_open'
        ? 250 + (metrics.errorRate * 100)
        : metrics.errorRate * 100;
      const latencyPenalty = metrics.latencyMs / 50;
      const score = (rule.priority * 5) + rule.cost_rank + latencyPenalty + healthPenalty - rule.weight - trafficBoost - preferredProtocolBoost;

      return {
        routingRuleId: rule.id,
        providerId: rule.provider_id,
        smppConfigId: rule.smpp_config_id,
        protocol,
        estimatedUnitCostMinor: cost,
        score,
      } satisfies RouteDecision;
    }))).filter((candidate): candidate is RouteDecision => candidate !== null);

    candidates.sort((left, right) => left.score - right.score);
    const winner = candidates[0];
    if (!winner) {
      throw new Error('No route candidates available');
    }
    return winner;
  }

  async getRetryPolicy(tenantId: string, providerId: number, trafficType?: string): Promise<RetryPolicy> {
    const result = await this.databaseService.query<{
      max_attempts: number;
      retry_intervals: number[];
      retry_on_errors: string[];
    }>(
      `
        SELECT max_attempts, retry_intervals, retry_on_errors
        FROM retry_policies
        WHERE (tenant_id = $1 OR tenant_id IS NULL)
          AND (provider_id = $2 OR provider_id IS NULL)
          AND ($3::varchar IS NULL OR traffic_type = $3 OR traffic_type IS NULL)
          AND is_active = TRUE
        ORDER BY
          (traffic_type IS NULL) ASC,
          tenant_id DESC NULLS LAST,
          provider_id DESC NULLS LAST,
          updated_at DESC
        LIMIT 1
      `,
      [tenantId, providerId, trafficType ?? null],
    );

    return {
      maxAttempts: result.rows[0]?.max_attempts ?? 3,
      retryIntervals: result.rows[0]?.retry_intervals ?? [5, 30, 300],
      retryOnErrors: result.rows[0]?.retry_on_errors ?? ['timeout', 'throttle', 'http_provider_error', 'smpp_throttle'],
    };
  }

  async listRoutingRules(user: JwtClaims, requestedTenantId?: string): Promise<Record<string, unknown>[]> {
    const tenantId = requestedTenantId ? resolveTenantScope(user, requestedTenantId) : user.tenantId;
    const result = await this.databaseService.query<{
      id: number;
      tenant_id: string | null;
      name: string;
      country_code: string;
      traffic_type: string;
      provider_id: number;
      smpp_config_id: number | null;
      preferred_protocol: 'http' | 'smpp' | null;
      priority: number;
      weight: number;
      max_tps: number | null;
      cost_rank: number;
      failover_order: number;
      is_active: boolean;
      updated_at: string;
    }>(
      `
        SELECT id, tenant_id, name, country_code, traffic_type, provider_id, smpp_config_id, preferred_protocol, priority, weight, max_tps, cost_rank, failover_order, is_active, updated_at
        FROM routing_rules
        WHERE ($1::uuid IS NULL OR tenant_id = $1 OR tenant_id IS NULL)
        ORDER BY priority ASC, failover_order ASC, id ASC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      countryCode: row.country_code,
      trafficType: row.traffic_type,
      providerId: row.provider_id,
      smppConfigId: row.smpp_config_id,
      preferredProtocol: row.preferred_protocol,
      priority: row.priority,
      weight: row.weight,
      maxTps: row.max_tps,
      costRank: row.cost_rank,
      failoverOrder: row.failover_order,
      isActive: row.is_active,
      updatedAt: row.updated_at,
    }));
  }

  async upsertRoutingRule(user: JwtClaims, dto: UpsertRoutingRuleDto, id?: number): Promise<Record<string, unknown>> {
    const tenantId = dto.tenantId ? resolveTenantScope(user, dto.tenantId) : user.tenantId;
    const result = await this.databaseService.query<{
      id: number;
      tenant_id: string | null;
      name: string;
      country_code: string;
      traffic_type: string;
      provider_id: number;
      smpp_config_id: number | null;
      preferred_protocol: 'http' | 'smpp' | null;
      priority: number;
      weight: number;
      max_tps: number | null;
      cost_rank: number;
      failover_order: number;
      is_active: boolean;
      updated_at: string;
    }>(
      id
        ? `
          UPDATE routing_rules
          SET
            tenant_id = $2,
            name = $3,
            country_code = $4,
            traffic_type = $5,
            provider_id = $6,
            smpp_config_id = $7,
            preferred_protocol = $8,
            priority = $9,
            weight = $10,
            max_tps = $11,
            cost_rank = $12,
            failover_order = $13,
            is_active = $14,
            updated_at = now()
          WHERE id = $1
          RETURNING id, tenant_id, name, country_code, traffic_type, provider_id, smpp_config_id, preferred_protocol, priority, weight, max_tps, cost_rank, failover_order, is_active, updated_at
        `
        : `
          INSERT INTO routing_rules (
            tenant_id, name, country_code, traffic_type, provider_id, smpp_config_id, preferred_protocol, priority, weight, max_tps, cost_rank, failover_order, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id, tenant_id, name, country_code, traffic_type, provider_id, smpp_config_id, preferred_protocol, priority, weight, max_tps, cost_rank, failover_order, is_active, updated_at
        `,
      id
        ? [
          id,
          tenantId,
          dto.name,
          dto.countryCode ?? 'ET',
          dto.trafficType ?? 'transactional',
          dto.providerId,
          dto.smppConfigId ?? null,
          dto.preferredProtocol ?? null,
          dto.priority ?? 100,
          dto.weight ?? 100,
          dto.maxTps ?? null,
          dto.costRank ?? 100,
          dto.failoverOrder ?? 1,
          dto.isActive ?? true,
        ]
        : [
          tenantId,
          dto.name,
          dto.countryCode ?? 'ET',
          dto.trafficType ?? 'transactional',
          dto.providerId,
          dto.smppConfigId ?? null,
          dto.preferredProtocol ?? null,
          dto.priority ?? 100,
          dto.weight ?? 100,
          dto.maxTps ?? null,
          dto.costRank ?? 100,
          dto.failoverOrder ?? 1,
          dto.isActive ?? true,
        ],
    );

    await this.redisService.delete(this.rulesCacheKey(tenantId, dto.trafficType ?? 'transactional'));
    return this.listRoutingRules(user, tenantId).then((rules) => rules.find((rule) => Number(rule.id) === result.rows[0]?.id) ?? {});
  }

  async listPricingRules(user: JwtClaims, requestedTenantId?: string): Promise<Record<string, unknown>[]> {
    const tenantId = requestedTenantId ? resolveTenantScope(user, requestedTenantId) : user.tenantId;
    const result = await this.databaseService.query<{
      id: number;
      kind: string;
      tenant_id: string | null;
      provider_id: number | null;
      country_code: string;
      traffic_type: string;
      parts_from: number;
      parts_to: number;
      unit_price_minor: number;
      currency: string;
      effective_from: string;
      effective_to: string | null;
      is_active: boolean;
    }>(
      `
        SELECT id, kind, tenant_id, provider_id, country_code, traffic_type, parts_from, parts_to, unit_price_minor, currency, effective_from, effective_to, is_active
        FROM pricing_rules
        WHERE (tenant_id = $1 OR provider_id IS NOT NULL)
        ORDER BY kind ASC, effective_from DESC, id DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      tenantId: row.tenant_id,
      providerId: row.provider_id,
      countryCode: row.country_code,
      trafficType: row.traffic_type,
      partsFrom: row.parts_from,
      partsTo: row.parts_to,
      unitPriceMinor: row.unit_price_minor,
      currency: row.currency,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      isActive: row.is_active,
    }));
  }

  async upsertPricingRule(user: JwtClaims, dto: UpsertPricingRuleDto, id?: number): Promise<Record<string, unknown>> {
    const tenantId = dto.tenantId ? resolveTenantScope(user, dto.tenantId) : user.tenantId;
    const result = await this.databaseService.query<{ id: number }>(
      id
        ? `
          UPDATE pricing_rules
          SET
            kind = $2,
            tenant_id = $3,
            provider_id = $4,
            country_code = $5,
            traffic_type = $6,
            parts_from = $7,
            parts_to = $8,
            unit_price_minor = $9,
            currency = $10,
            is_active = $11
          WHERE id = $1
          RETURNING id
        `
        : `
          INSERT INTO pricing_rules (
            kind, tenant_id, provider_id, country_code, traffic_type, parts_from, parts_to, unit_price_minor, currency, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `,
      id
        ? [
          id,
          dto.kind,
          dto.kind === 'sell' ? tenantId : null,
          dto.kind === 'cost' ? dto.providerId ?? null : null,
          dto.countryCode ?? 'ET',
          dto.trafficType ?? 'transactional',
          dto.partsFrom ?? 1,
          dto.partsTo ?? 1,
          dto.unitPriceMinor,
          dto.currency ?? 'ETB',
          dto.isActive ?? true,
        ]
        : [
          dto.kind,
          dto.kind === 'sell' ? tenantId : null,
          dto.kind === 'cost' ? dto.providerId ?? null : null,
          dto.countryCode ?? 'ET',
          dto.trafficType ?? 'transactional',
          dto.partsFrom ?? 1,
          dto.partsTo ?? 1,
          dto.unitPriceMinor,
          dto.currency ?? 'ETB',
          dto.isActive ?? true,
        ],
    );

    return {
      id: result.rows[0]?.id,
    };
  }

  async listRetryPolicies(user: JwtClaims, requestedTenantId?: string): Promise<Record<string, unknown>[]> {
    const tenantId = requestedTenantId ? resolveTenantScope(user, requestedTenantId) : user.tenantId;
    const result = await this.databaseService.query<{
      id: number;
      tenant_id: string | null;
      provider_id: number | null;
      traffic_type: string | null;
      max_attempts: number;
      retry_intervals: number[];
      retry_on_errors: string[];
      is_active: boolean;
      updated_at: string;
    }>(
      `
        SELECT id, tenant_id, provider_id, traffic_type, max_attempts, retry_intervals, retry_on_errors, is_active, updated_at
        FROM retry_policies
        WHERE tenant_id = $1 OR tenant_id IS NULL
        ORDER BY updated_at DESC, id DESC
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      providerId: row.provider_id,
      trafficType: row.traffic_type,
      maxAttempts: row.max_attempts,
      retryIntervals: row.retry_intervals,
      retryOnErrors: row.retry_on_errors,
      isActive: row.is_active,
      updatedAt: row.updated_at,
    }));
  }

  async upsertRetryPolicy(user: JwtClaims, dto: UpsertRetryPolicyDto, id?: number): Promise<Record<string, unknown>> {
    const tenantId = dto.tenantId ? resolveTenantScope(user, dto.tenantId) : user.tenantId;
    const result = await this.databaseService.query<{ id: number }>(
      id
        ? `
          UPDATE retry_policies
          SET
            tenant_id = $2,
            provider_id = $3,
            traffic_type = $4,
            max_attempts = $5,
            retry_intervals = $6,
            retry_on_errors = $7,
            is_active = $8,
            updated_at = now()
          WHERE id = $1
          RETURNING id
        `
        : `
          INSERT INTO retry_policies (
            tenant_id, provider_id, traffic_type, max_attempts, retry_intervals, retry_on_errors, is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
      id
        ? [
          id,
          tenantId,
          dto.providerId ?? null,
          dto.trafficType ?? null,
          dto.maxAttempts ?? 3,
          JSON.stringify(dto.retryIntervals),
          JSON.stringify(dto.retryOnErrors),
          dto.isActive ?? true,
        ]
        : [
          tenantId,
          dto.providerId ?? null,
          dto.trafficType ?? null,
          dto.maxAttempts ?? 3,
          JSON.stringify(dto.retryIntervals),
          JSON.stringify(dto.retryOnErrors),
          dto.isActive ?? true,
        ],
    );

    return {
      id: result.rows[0]?.id,
    };
  }
}
