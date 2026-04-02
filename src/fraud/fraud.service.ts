import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopics } from '../kafka/kafka-topics';
import { CreateFraudRuleDto } from './dto/create-fraud-rule.dto';

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
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.kafkaService.subscribe(KafkaTopics.SmsDispatchRealtime, 'fraud-dispatch-realtime', async ({ value }) => {
        const payload = JSON.parse(value) as FraudEvaluationInput;
        const evaluation = await this.evaluate(payload);
        if (evaluation.action !== 'allow') {
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

    for (const rule of rules) {
      if (rule.rule_type === 'keyword_block') {
        const hit = rule.values.find((value) => input.body.toLowerCase().includes(value.toLowerCase()));
        if (hit) {
          reasons.push(`keyword:${hit}`);
          action = rule.action as FraudEvaluationResult['action'];
        }
      }

      if (rule.rule_type === 'prefix_block') {
        const hit = rule.values.find((value) => input.phoneNumber.startsWith(value));
        if (hit) {
          reasons.push(`prefix:${hit}`);
          action = rule.action as FraudEvaluationResult['action'];
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
      action = action === 'block' ? 'block' : 'throttle';
      score += 0.3;
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
