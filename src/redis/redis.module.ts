import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RateLimitService } from './rate-limit.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Global()
@Module({
  providers: [RedisService, RateLimitService, CircuitBreakerService],
  exports: [RedisService, RateLimitService, CircuitBreakerService],
})
export class RedisModule {}
