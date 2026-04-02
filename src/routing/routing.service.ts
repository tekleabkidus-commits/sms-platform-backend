import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { ProvidersService } from '../providers/providers.service';

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

  async selectRoute(tenantId: string, phoneNumber: string, trafficType: string): Promise<RouteDecision> {
    const rules = await this.getRules(tenantId, trafficType);
    if (rules.length === 0) {
      throw new Error(`No routing rules found for ${tenantId}/${trafficType}`);
    }

    const countryCode = this.normalizeCountryCode(phoneNumber);
    const unitCosts = await this.getUnitCosts(
      rules.map((rule) => rule.provider_id),
      countryCode,
      trafficType,
    );

    const candidates = await Promise.all(rules.map(async (rule) => {
      const metrics = await this.providersService.getProviderMetrics(rule.provider_id);
      const protocol = rule.preferred_protocol ?? (rule.smpp_config_id ? 'smpp' : 'http');
      const cost = unitCosts.get(rule.provider_id) ?? 0;
      const trafficBoost = trafficType === 'otp' ? (protocol === 'smpp' ? 10 : 0) : 0;
      const healthPenalty = metrics.circuitState === 'open' ? 1000 : metrics.errorRate * 100;
      const latencyPenalty = metrics.latencyMs / 50;
      const score = (rule.priority * 5) + rule.cost_rank + latencyPenalty + healthPenalty - rule.weight - trafficBoost;

      return {
        routingRuleId: rule.id,
        providerId: rule.provider_id,
        smppConfigId: rule.smpp_config_id,
        protocol,
        estimatedUnitCostMinor: cost,
        score,
      } satisfies RouteDecision;
    }));

    candidates.sort((left, right) => left.score - right.score);
    const winner = candidates[0];
    if (!winner) {
      throw new Error('No route candidates available');
    }
    return winner;
  }

  async getRetryPolicy(tenantId: string, providerId: number): Promise<RetryPolicy> {
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
          AND is_active = TRUE
        ORDER BY tenant_id DESC NULLS LAST, provider_id DESC NULLS LAST, updated_at DESC
        LIMIT 1
      `,
      [tenantId, providerId],
    );

    return {
      maxAttempts: result.rows[0]?.max_attempts ?? 3,
      retryIntervals: result.rows[0]?.retry_intervals ?? [5, 30, 300],
      retryOnErrors: result.rows[0]?.retry_on_errors ?? ['timeout', 'throttle', 'http_provider_error'],
    };
  }
}
