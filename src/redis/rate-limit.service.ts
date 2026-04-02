import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redisService: RedisService) {}

  async enforceLimit(key: string, limit: number, ttlSeconds: number): Promise<void> {
    const client = this.redisService.getClient();
    const hits = await client.incr(key);
    if (hits === 1) {
      await client.expire(key, ttlSeconds);
    }

    if (hits > limit) {
      throw new HttpException(`Rate limit exceeded for ${key}`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
