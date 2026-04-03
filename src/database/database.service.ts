import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface TransactionContext {
  client: PoolClient;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    this.pool = new Pool({
      host: configService.getOrThrow<string>('postgres.host'),
      port: configService.getOrThrow<number>('postgres.port'),
      user: configService.getOrThrow<string>('postgres.user'),
      password: configService.getOrThrow<string>('postgres.password'),
      database: configService.getOrThrow<string>('postgres.database'),
      max: configService.getOrThrow<number>('postgres.maxPool'),
      ssl: configService.get<boolean>('postgres.ssl') ? { rejectUnauthorized: false } : undefined,
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async withTransaction<T>(executor: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await executor({ client });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing PostgreSQL pool');
    await this.pool.end();
  }
}
