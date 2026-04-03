import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../common/metrics/metrics.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from './redis.service';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitSnapshot {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastChangedAt: string;
  nextProbeAt: string | null;
  lastReason: string | null;
}

@Injectable()
export class CircuitBreakerService implements OnModuleInit {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly failureThreshold: number;
  private readonly openSeconds: number;
  private readonly halfOpenProbeSeconds: number;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.failureThreshold = configService.getOrThrow<number>('circuitBreaker.failureThreshold');
    this.openSeconds = configService.getOrThrow<number>('circuitBreaker.openSeconds');
    this.halfOpenProbeSeconds = configService.getOrThrow<number>('circuitBreaker.halfOpenProbeSeconds');
  }

  private getKey(providerId: number): string {
    return `circuit:provider:${providerId}`;
  }

  private getProbeKey(providerId: number): string {
    return `circuit:provider:${providerId}:probe`;
  }

  private defaultSnapshot(): CircuitSnapshot {
    return {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastChangedAt: new Date().toISOString(),
      nextProbeAt: null,
      lastReason: null,
    };
  }

  private calculateSnapshotTtlSeconds(snapshot: CircuitSnapshot): number {
    if (snapshot.state === 'closed') {
      return Math.max(this.openSeconds, this.halfOpenProbeSeconds);
    }

    if (snapshot.nextProbeAt) {
      const remainingSeconds = Math.ceil((new Date(snapshot.nextProbeAt).getTime() - Date.now()) / 1000);
      return Math.max(1, remainingSeconds);
    }

    return snapshot.state === 'half_open' ? this.halfOpenProbeSeconds : this.openSeconds;
  }

  private async persistSnapshot(providerId: number, snapshot: CircuitSnapshot): Promise<void> {
    await this.redisService.setJson(
      this.getKey(providerId),
      snapshot,
      this.calculateSnapshotTtlSeconds(snapshot),
    );
  }

  async onModuleInit(): Promise<void> {
    const rows = await this.databaseService.query<{
      provider_id: number;
      state: CircuitState;
      failure_count: number;
      success_count: number;
      opened_reason: string | null;
      last_changed: string;
      next_probe_at: string | null;
    }>(
      `
        SELECT
          pcs.provider_id,
          pcs.state,
          pcs.failure_count,
          pcs.success_count,
          pcs.opened_reason,
          pcs.last_changed,
          pcs.next_probe_at
        FROM provider_circuit_state pcs
        INNER JOIN providers p
          ON p.id = pcs.provider_id
        WHERE p.is_active = TRUE
      `,
    );

    let hydrated = 0;
    let skipped = 0;

    for (const row of rows.rows) {
      const snapshot: CircuitSnapshot = {
        state: row.state,
        failureCount: row.failure_count,
        successCount: row.success_count,
        lastChangedAt: row.last_changed,
        nextProbeAt: row.next_probe_at,
        lastReason: row.opened_reason,
      };

      const existing = await this.redisService.getJson<CircuitSnapshot>(this.getKey(row.provider_id));
      if (existing && new Date(existing.lastChangedAt).getTime() >= new Date(snapshot.lastChangedAt).getTime()) {
        this.metricsService.setProviderCircuitState(row.provider_id, existing.state);
        skipped += 1;
        continue;
      }

      await this.persistSnapshot(row.provider_id, snapshot);
      this.metricsService.setProviderCircuitState(row.provider_id, snapshot.state);
      hydrated += 1;
    }

    this.logger.log(`Circuit breaker warm start complete: hydrated=${hydrated}, skipped=${skipped}`);
  }

  async getSnapshot(providerId: number): Promise<CircuitSnapshot> {
    return (await this.redisService.getJson<CircuitSnapshot>(this.getKey(providerId))) ?? this.defaultSnapshot();
  }

  async getState(providerId: number): Promise<CircuitState> {
    return (await this.getSnapshot(providerId)).state;
  }

  async setState(providerId: number, state: CircuitState, ttlSeconds = this.openSeconds, reason?: string): Promise<CircuitSnapshot> {
    const nextProbeAt = state === 'open'
      ? new Date(Date.now() + (ttlSeconds * 1000)).toISOString()
      : null;
    const snapshot: CircuitSnapshot = {
      state,
      failureCount: state === 'closed' ? 0 : 1,
      successCount: state === 'closed' ? 1 : 0,
      lastChangedAt: new Date().toISOString(),
      nextProbeAt,
      lastReason: reason ?? null,
    };
    await this.redisService.setJson(this.getKey(providerId), snapshot, Math.max(ttlSeconds, this.calculateSnapshotTtlSeconds(snapshot)));
    this.metricsService.setProviderCircuitState(providerId, state);
    return snapshot;
  }

  async registerFailure(providerId: number, reason?: string): Promise<CircuitSnapshot> {
    const snapshot = await this.getSnapshot(providerId);
    const failureCount = snapshot.failureCount + 1;
    const nextState = failureCount >= this.failureThreshold ? 'open' : snapshot.state;
    const nextSnapshot: CircuitSnapshot = {
      state: nextState,
      failureCount,
      successCount: 0,
      lastChangedAt: new Date().toISOString(),
      nextProbeAt: nextState === 'open'
        ? new Date(Date.now() + (this.openSeconds * 1000)).toISOString()
        : snapshot.nextProbeAt,
      lastReason: reason ?? null,
    };
    await this.persistSnapshot(providerId, nextSnapshot);
    this.metricsService.setProviderCircuitState(providerId, nextSnapshot.state);
    return nextSnapshot;
  }

  async registerSuccess(providerId: number): Promise<CircuitSnapshot> {
    const nextSnapshot: CircuitSnapshot = {
      state: 'closed',
      failureCount: 0,
      successCount: 1,
      lastChangedAt: new Date().toISOString(),
      nextProbeAt: null,
      lastReason: null,
    };
    await this.persistSnapshot(providerId, nextSnapshot);
    await this.redisService.delete(this.getProbeKey(providerId));
    this.metricsService.setProviderCircuitState(providerId, nextSnapshot.state);
    return nextSnapshot;
  }

  async allowDispatch(providerId: number): Promise<boolean> {
    const snapshot = await this.getSnapshot(providerId);
    if (snapshot.state === 'closed') {
      return true;
    }

    const now = Date.now();
    if (snapshot.state === 'open' && snapshot.nextProbeAt && new Date(snapshot.nextProbeAt).getTime() <= now) {
      await this.persistSnapshot(providerId, {
        ...snapshot,
        state: 'half_open',
        lastChangedAt: new Date().toISOString(),
        nextProbeAt: new Date(now + (this.halfOpenProbeSeconds * 1000)).toISOString(),
      });
      this.metricsService.setProviderCircuitState(providerId, 'half_open');
    }

    const latest = await this.getSnapshot(providerId);
    if (latest.state === 'closed') {
      return true;
    }

    if (latest.state === 'open') {
      return false;
    }

    const probeGranted = await this.redisService.getClient().set(
      this.getProbeKey(providerId),
      '1',
      'EX',
      this.halfOpenProbeSeconds,
      'NX',
    );
    return probeGranted === 'OK';
  }
}
