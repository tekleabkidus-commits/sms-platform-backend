import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    this.client = new Redis({
      host: configService.getOrThrow<string>('redis.host'),
      port: configService.getOrThrow<number>('redis.port'),
      username: configService.get<string>('redis.username'),
      password: configService.get<string>('redis.password'),
      db: configService.get<number>('redis.db'),
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis client error', error.stack);
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) as T : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
      return;
    }

    await this.client.set(key, serialized);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing Redis connection');
    await this.client.quit();
  }
}
