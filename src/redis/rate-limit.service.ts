import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { MetricsService } from '../common/metrics/metrics.service';
import { RedisService } from './redis.service';

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_tokens = tonumber(ARGV[2])
local refill_period_ms = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local now_ms = tonumber(ARGV[5])
local ttl_ms = tonumber(ARGV[6])

local bucket = redis.call('HMGET', key, 'tokens', 'updated_at')
local tokens = tonumber(bucket[1])
local updated_at = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
end

if updated_at == nil then
  updated_at = now_ms
end

if now_ms > updated_at then
  local elapsed = now_ms - updated_at
  local refill = (elapsed / refill_period_ms) * refill_tokens
  tokens = math.min(capacity, tokens + refill)
end

local allowed = 0
local retry_after_ms = 0

if tokens >= requested then
  allowed = 1
  tokens = tokens - requested
else
  local missing = requested - tokens
  retry_after_ms = math.ceil((missing / refill_tokens) * refill_period_ms)
end

redis.call('HSET', key, 'tokens', tostring(tokens), 'updated_at', now_ms)
redis.call('PEXPIRE', key, ttl_ms)

return { allowed, tostring(tokens), retry_after_ms }
`;

interface TokenBucketResult {
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs: number;
}

@Injectable()
export class RateLimitService {
  constructor(
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
  ) {}

  private async consumeTokens(
    key: string,
    capacity: number,
    refillTokens: number,
    refillPeriodMs: number,
    amount = 1,
    nowMs = Date.now(),
  ): Promise<TokenBucketResult> {
    if (capacity <= 0 || refillTokens <= 0 || refillPeriodMs <= 0) {
      throw new HttpException(`Invalid token bucket configuration for ${key}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const client = this.redisService.getClient();
    const ttlMs = Math.max(
      refillPeriodMs,
      Math.ceil((capacity / refillTokens) * refillPeriodMs),
    );
    const result = await client.eval(
      TOKEN_BUCKET_LUA,
      1,
      key,
      capacity.toString(),
      refillTokens.toString(),
      refillPeriodMs.toString(),
      amount.toString(),
      nowMs.toString(),
      ttlMs.toString(),
    ) as [number | string, number | string, number | string];

    return {
      allowed: Number(result[0]) === 1,
      remainingTokens: Number(result[1]),
      retryAfterMs: Number(result[2]),
    };
  }

  async enforceLimit(key: string, limit: number, ttlSeconds: number, amount = 1): Promise<number> {
    const result = await this.consumeTokens(
      key,
      limit,
      limit,
      ttlSeconds * 1000,
      amount,
    );

    if (!result.allowed) {
      this.metricsService.recordRateLimitDenied(this.classifyScope(key));
      throw new HttpException(
        `Rate limit exceeded for ${key}. Retry after ${Math.max(1, Math.ceil(result.retryAfterMs / 1000))} seconds`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return result.remainingTokens;
  }

  async enforceDailyQuota(key: string, limit: number, now = new Date()): Promise<number> {
    const secondsPerDay = 24 * 60 * 60;
    const result = await this.consumeTokens(
      key,
      limit,
      limit,
      secondsPerDay * 1000,
      1,
      now.getTime(),
    );

    if (!result.allowed) {
      this.metricsService.recordRateLimitDenied('daily_quota');
      throw new HttpException(
        `Rate limit exceeded for ${key}. Retry after ${Math.max(1, Math.ceil(result.retryAfterMs / 1000))} seconds`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return result.remainingTokens;
  }

  private classifyScope(key: string): string {
    if (key.startsWith('rl:tenant:') && key.includes(':api:')) {
      return 'tenant_api';
    }
    if (key.startsWith('rl:key:')) {
      return 'api_key_api';
    }
    if (key.startsWith('rl:tenant:') && key.includes(':submit:')) {
      return 'tenant_submit';
    }
    if (key.startsWith('rl:provider:') && key.includes(':session:')) {
      return 'provider_session';
    }
    if (key.startsWith('rl:provider:') && key.includes(':global')) {
      return 'provider_global';
    }
    return 'generic';
  }
}
