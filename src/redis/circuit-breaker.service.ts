import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

export type CircuitState = 'closed' | 'open' | 'half_open';

@Injectable()
export class CircuitBreakerService {
  constructor(private readonly redisService: RedisService) {}

  private getKey(providerId: number): string {
    return `circuit:provider:${providerId}`;
  }

  async getState(providerId: number): Promise<CircuitState> {
    const state = await this.redisService.getClient().get(this.getKey(providerId));
    return (state as CircuitState | null) ?? 'closed';
  }

  async setState(providerId: number, state: CircuitState, ttlSeconds = 300): Promise<void> {
    await this.redisService.getClient().set(this.getKey(providerId), state, 'EX', ttlSeconds);
  }
}
