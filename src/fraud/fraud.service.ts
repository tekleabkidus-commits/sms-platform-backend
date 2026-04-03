import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { MetricsService } from '../common/metrics/metrics.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopics } from '../kafka/kafka-topics';
import { CreateFraudRuleDto } from './dto/create-fraud-rule.dto';
import { RuntimeRoleService } from '../runtime/runtime-role.service';

interface FraudRuleRow {
  id: number;
  tenant_id: string | null;
  name: string;
  rule_type: string;
  action: string;
  values: string[];
  is_active: boolean;
}

export interface FraudEvaluationInput {
  tenantId: string;
  phoneNumber: string;
  body: string;
  senderId: string;
  trafficType: string;
}

export interface FraudEvaluationResult {
  action: 'allow' | 'throttle' | 'block' | 'alert';
  reasons: string[];
  score: number;
}

@Injectable()
export class FraudService implements OnModuleInit {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly kafkaService: KafkaService,
    private readonly runtimeRoleService: RuntimeRoleService,
    private readonly metricsService: MetricsService,
  ) {}

  private actionPriority(action: FraudEvaluationResult['action']): number {
    switch (action) {
      case 'block':
        return 4;
      case 'throttle':
        return 3;
      case 'alert':
        return 2;
      default:
        return 1;
    }
  }

  private mergeAction(
    current: FraudEvaluationResult['action'],
    next: FraudEvaluationResult['action'],
  ): FraudEvaluationResult['action'] {
    return this.actionPriority(next) > this.actionPriority(current) ? next : current;
  }

  private async getTenantPriorityTier(tenantId: string): Promise<number> {
    const cacheKey = `fraud-tenant-tier:${tenantId}`;
    const cached = await this.redisService.getJson<number>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.databaseService.query<{ priority_tier: number }>(
      'SELECT priority_tier FROM tenants WHERE id = $1 LIMIT 1',
      [tenantId],
    );
    const tier = result.rows[0]?.priority_tier ?? 1;
    await this.redisService.setJson(cacheKey, tier, 60);
    return tier;
  }

  async onModuleInit(): Promise<void> {
    if (!this.runtimeRoleService.hasCapability('fraudConsumers')) {
      return;
    }
    await Promise.all([
      this.kafkaService.subscribe(KafkaTopics.SmsDispatchRealtime, 'fraud-dispatch-realtime', async ({ value }) => {
        const payload = JSON.parse(value) as FraudEvaluationInput;
        const evaluation = await this.evaluate(payload);
        if (evaluation.action !== 'allow') {
          this.metricsService.recordRetry('queued', `fraud_${evaluation.action}`);
          await this.publishAlert(payload, evaluation);
        }
      }),
      this.kafkaService.subscribe(KafkaTopics.SmsDispatchResults, 'fraud-dispatch-results', async ({ value }) => {
        const payload = JSON.parse(value) as FraudEvaluationInput & { providerError?: string };
        const evaluation = await this.evaluate(payload);
        if (payload.providerError && evaluation.action === 'allow') {
          await this.publishAlert(payload, {
            action: 'alert',
            reasons: [`provider_error:${payload.providerError}`],
            score: 0.5,
          });
        }
      }),
    ]);
  }

  private async publishAlert(payload: FraudEvaluationInput, result: FraudEvaluationResult): Promise<void> {
    await this.kafkaService.publish({
      topic: KafkaTopics.FraudAlerts,
      messages: [{
        key: payload.tenantId,
        value: JSON.stringify({ payload, result, createdAt: new Date().toISOString() }),
      }],
    });
  }

  async createRule(tenantId: string, dto: CreateFraudRuleDto): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<{
      id: number;
      name: string;
      rule_type: string;
      action: string;
      values: string[];
      is_active: boolean;
    }>(
      `
        INSERT INTO fraud_rules (tenant_id, name, rule_type, action, values, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, rule_type, action, values, is_active
      `,
      [tenantId, dto.name, dto.ruleType, dto.action, JSON.stringify(dto.values ?? []), dto.isActive ?? true],
    );

    await this.redisService.delete(`fraud-rules:${tenantId}`);

    return result.rows[0] ?? {};
  }

  async listRules(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<FraudRuleRow>(
      `
        SELECT id, tenant_id, name, rule_type, action, values, is_active
        FROM fraud_rules
        WHERE tenant_id = $1
        ORDER BY id DESC
      `,
      [tenantId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      ruleType: row.rule_type,
      action: row.action,
      values: row.values,
      isActive: row.is_active,
    }));
  }

  async listEvents(tenantId: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      message_submit_date: string;
      message_id: number;
      event_type: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>(
      `
        SELECT message_submit_date, message_id, event_type, payload, created_at
        FROM message_logs
        WHERE tenant_id = $1
          AND (
            event_type IN ('submit_throttled', 'failed')
            OR payload::text ILIKE '%fraud%'
          )
        ORDER BY created_at DESC
        LIMIT 200
      `,
      [tenantId],
    );

    return result.rows.map((row) => ({
      messageSubmitDate: row.message_submit_date,
      messageId: row.message_id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  }

  private async getRules(tenantId: string): Promise<FraudRuleRow[]> {
    const cacheKey = `fraud-rules:${tenantId}`;
    const cached = await this.redisService.getJson<FraudRuleRow[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.databaseService.query<FraudRuleRow>(
      `
        SELECT id, tenant_id, name, rule_type, action, values, is_active
        FROM fraud_rules
        WHERE (tenant_id = $1 OR tenant_id IS NULL)
          AND is_active = TRUE
      `,
      [tenantId],
    );
    await this.redisService.setJson(cacheKey, result.rows, 60);
    return result.rows;
  }

  private async mlScore(input: FraudEvaluationInput): Promise<number> {
    let score = 0;
    if (input.trafficType === 'marketing') {
      score += 0.15;
    }
    if (input.body.length > 300) {
      score += 0.1;
    }
    if (/https?:\/\//i.test(input.body)) {
      score += 0.2;
    }
    return score;
  }

  async evaluate(input: FraudEvaluationInput): Promise<FraudEvaluationResult> {
    const rules = await this.getRules(input.tenantId);
    const reasons: string[] = [];
    let action: FraudEvaluationResult['action'] = 'allow';
    let score = await this.mlScore(input);
    const tenantPriorityTier = await this.getTenantPriorityTier(input.tenantId);

    for (const rule of rules) {
      if (rule.rule_type === 'keyword_block') {
        const hit = rule.values.find((value) => input.body.toLowerCase().includes(value.toLowerCase()));
        if (hit) {
          reasons.push(`keyword:${hit}`);
          action = this.mergeAction(action, rule.action as FraudEvaluationResult['action']);
        }
      }

      if (rule.rule_type === 'prefix_block') {
        const hit = rule.values.find((value) => input.phoneNumber.startsWith(value));
        if (hit) {
          reasons.push(`prefix:${hit}`);
          action = this.mergeAction(action, rule.action as FraudEvaluationResult['action']);
        }
      }

      if (rule.rule_type === 'sender_block') {
        const hit = rule.values.find((value) => input.senderId.toLowerCase() === value.toLowerCase());
        if (hit) {
          reasons.push(`sender:${hit}`);
          action = this.mergeAction(action, rule.action as FraudEvaluationResult['action']);
        }
      }
    }

    const velocityKey = `fraud:velocity:${input.tenantId}:${input.senderId}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.redisService.getClient().incr(velocityKey);
    if (count === 1) {
      await this.redisService.getClient().expire(velocityKey, 60);
    }
    if (count > 5000) {
      reasons.push('velocity_threshold');
      action = this.mergeAction(action, 'throttle');
      score += 0.3;
    }

    const prefix = input.phoneNumber.slice(0, Math.min(input.phoneNumber.length, 7));
    const destinationPrefixKey = `fraud:prefix:${input.tenantId}:${prefix}:${Math.floor(Date.now() / 60000)}`;
    const prefixHits = await this.redisService.getClient().incr(destinationPrefixKey);
    if (prefixHits === 1) {
      await this.redisService.getClient().expire(destinationPrefixKey, 60);
    }
    if (prefixHits > 7500) {
      reasons.push('prefix_velocity_threshold');
      action = this.mergeAction(action, 'throttle');
      score += 0.2;
    }

    if (tenantPriorityTier <= 1 && input.trafficType === 'marketing' && /https?:\/\//i.test(input.body)) {
      reasons.push('low_trust_marketing_url');
      action = this.mergeAction(action, 'block');
      score += 0.35;
    }

    return { action, reasons, score };
  }

  async enforceSubmission(input: FraudEvaluationInput): Promise<void> {
    const evaluation = await this.evaluate(input);
    if (evaluation.action === 'block') {
      throw new BadRequestException(`Message blocked by fraud policy: ${evaluation.reasons.join(', ')}`);
    }
    if (evaluation.action === 'throttle') {
      throw new HttpException(
        `Message throttled by fraud policy: ${evaluation.reasons.join(', ')}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
