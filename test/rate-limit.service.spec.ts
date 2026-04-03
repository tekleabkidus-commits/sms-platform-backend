import { HttpException } from '@nestjs/common';
import { RateLimitService } from '../src/redis/rate-limit.service';

describe('RateLimitService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildService = () => {
    const buckets = new Map<string, { tokens: number; updatedAt: number }>();
    const evalMock = jest.fn(async (
      _script: string,
      _keysCount: number,
      key: string,
      capacityRaw: string,
      refillTokensRaw: string,
      refillPeriodMsRaw: string,
      amountRaw: string,
      nowMsRaw: string,
    ) => {
      const capacity = Number(capacityRaw);
      const refillTokens = Number(refillTokensRaw);
      const refillPeriodMs = Number(refillPeriodMsRaw);
      const amount = Number(amountRaw);
      const nowMs = Number(nowMsRaw);
      const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: nowMs };
      const elapsed = Math.max(0, nowMs - bucket.updatedAt);
      const replenished = Math.min(capacity, bucket.tokens + ((elapsed / refillPeriodMs) * refillTokens));

      let allowed = 0;
      let retryAfterMs = 0;
      let tokens = replenished;
      if (tokens >= amount) {
        allowed = 1;
        tokens -= amount;
      } else {
        retryAfterMs = Math.ceil(((amount - tokens) / refillTokens) * refillPeriodMs);
      }

      buckets.set(key, { tokens, updatedAt: nowMs });
      return [allowed, tokens.toString(), retryAfterMs];
    });

    return {
      service: new RateLimitService({
        getClient: jest.fn().mockReturnValue({
          eval: evalMock,
        }),
      } as never, {
        recordRateLimitDenied: jest.fn(),
      } as never),
      evalMock,
    };
  };

  it('allows requests under the configured limit', async () => {
    const { service } = buildService();
    jest.spyOn(Date, 'now').mockReturnValue(0);

    await expect(service.enforceLimit('rl:test', 10, 1)).resolves.toBe(9);
  });

  it('rejects bursts across window boundaries instead of allowing fixed-window spikes', async () => {
    const { service } = buildService();
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(999);
    await service.enforceLimit('rl:test', 2, 1);
    await service.enforceLimit('rl:test', 2, 1);

    nowSpy.mockReturnValue(1001);
    await expect(service.enforceLimit('rl:test', 2, 1)).rejects.toBeInstanceOf(HttpException);
  });

  it('enforces daily quotas using the same token-bucket model', async () => {
    const { service } = buildService();

    await expect(
      service.enforceDailyQuota('quota:key:test', 2, new Date('2026-04-02T00:00:00.000Z')),
    ).resolves.toBe(1);
    await expect(
      service.enforceDailyQuota('quota:key:test', 2, new Date('2026-04-02T00:00:01.000Z')),
    ).resolves.toBeCloseTo(0, 4);
    await expect(
      service.enforceDailyQuota('quota:key:test', 2, new Date('2026-04-02T00:00:02.000Z')),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
