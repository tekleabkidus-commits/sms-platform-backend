import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitService } from '../src/redis/rate-limit.service';

describe('RateLimitService', () => {
  it('allows requests under the configured limit', async () => {
    const service = new RateLimitService({
      getClient: jest.fn().mockReturnValue({
        incr: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
      }),
    } as never);

    await expect(service.enforceLimit('rl:test', 10, 1)).resolves.toBeUndefined();
  });

  it('throws when the configured limit is exceeded', async () => {
    const service = new RateLimitService({
      getClient: jest.fn().mockReturnValue({
        incr: jest.fn().mockResolvedValue(11),
        expire: jest.fn().mockResolvedValue(1),
      }),
    } as never);

    await expect(service.enforceLimit('rl:test', 10, 1)).rejects.toBeInstanceOf(HttpException);
  });
});
