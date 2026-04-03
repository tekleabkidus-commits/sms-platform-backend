import { Injectable, NotFoundException } from '@nestjs/common';
import { MetricsService } from '../common/metrics/metrics.service';
import { DatabaseService } from '../database/database.service';
import { RateLimitService } from '../redis/rate-limit.service';
import {
  CircuitBreakerService,
  CircuitSnapshot,
  CircuitState,
} from '../redis/circuit-breaker.service';

export interface ProviderProfile {
  id: number;
  code: string;
  name: string;
  defaultProtocol: 'http' | 'smpp';
  httpBaseUrl: string | null;
  maxGlobalTps: number;
  healthStatus: string;
}

export interface SmppConfigProfile {
  id: number;
  providerId: number;
  host: string;
  port: number;
  systemId: string;
  secretRef: string;
  bindMode: string;
  maxSessions: number;
  sessionTps: number;
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly rateLimitService: RateLimitService,
    private readonly metricsService: MetricsService,
  ) {}

  async getProvider(providerId: number): Promise<ProviderProfile> {
    const result = await this.databaseService.query<{
      id: number;
      code: string;
      name: string;
      default_protocol: 'http' | 'smpp';
      http_base_url: string | null;
      max_global_tps: number;
      health_status: string;
    }>(
      `
        SELECT id, code, name, default_protocol, http_base_url, max_global_tps, health_status
        FROM providers
        WHERE id = $1
      `,
      [providerId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Provider not found');
    }

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      defaultProtocol: row.default_protocol,
      httpBaseUrl: row.http_base_url,
      maxGlobalTps: row.max_global_tps,
      healthStatus: row.health_status,
    };
  }

  async listProviders(): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      id: number;
      code: string;
      name: string;
      default_protocol: 'http' | 'smpp';
      http_base_url: string | null;
      max_global_tps: number;
      priority: number;
      is_active: boolean;
      health_status: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, code, name, default_protocol, http_base_url, max_global_tps, priority, is_active, health_status, created_at, updated_at
        FROM providers
        ORDER BY priority ASC, id ASC
      `,
    );

    return Promise.all(result.rows.map(async (row) => {
      const metrics = await this.getProviderMetrics(row.id);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        defaultProtocol: row.default_protocol,
        httpBaseUrl: row.http_base_url,
        maxGlobalTps: row.max_global_tps,
        priority: row.priority,
        isActive: row.is_active,
        healthStatus: row.health_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metrics,
      };
    }));
  }

  async getSmppConfig(smppConfigId: number): Promise<SmppConfigProfile> {
    const result = await this.databaseService.query<{
      id: number;
      provider_id: number;
      host: string;
      port: number;
      system_id: string;
      secret_ref: string;
      bind_mode: string;
      max_sessions: number;
      session_tps: number;
    }>(
      `
        SELECT id, provider_id, host, port, system_id, secret_ref, bind_mode, max_sessions, session_tps
        FROM smpp_configs
        WHERE id = $1 AND is_active = TRUE
      `,
      [smppConfigId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('SMPP config not found');
    }

    return {
      id: row.id,
      providerId: row.provider_id,
      host: row.host,
      port: row.port,
      systemId: row.system_id,
      secretRef: row.secret_ref,
      bindMode: row.bind_mode,
      maxSessions: row.max_sessions,
      sessionTps: row.session_tps,
    };
  }

  async getProviderMetrics(providerId: number): Promise<{ latencyMs: number; errorRate: number; circuitState: CircuitState }> {
    const result = await this.databaseService.query<{ latency_ms: number | null; error_rate: string | null }>(
      `
        SELECT latency_ms, error_rate
        FROM provider_health_logs
        WHERE provider_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1
      `,
      [providerId],
    );

    const circuitState = await this.circuitBreakerService.getState(providerId);
    return {
      latencyMs: result.rows[0]?.latency_ms ?? 0,
      errorRate: Number(result.rows[0]?.error_rate ?? 0),
      circuitState,
    };
  }

  async getProviderHealthHistory(providerId: number): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      protocol: string;
      status: string;
      latency_ms: number | null;
      error_rate: string | null;
      success_tps: number | null;
      throttle_count: number;
      sample_window_sec: number;
      recorded_at: string;
    }>(
      `
        SELECT protocol, status, latency_ms, error_rate, success_tps, throttle_count, sample_window_sec, recorded_at
        FROM provider_health_logs
        WHERE provider_id = $1
        ORDER BY recorded_at DESC
        LIMIT 120
      `,
      [providerId],
    );

    return result.rows.map((row) => ({
      protocol: row.protocol,
      status: row.status,
      latencyMs: row.latency_ms,
      errorRate: Number(row.error_rate ?? 0),
      successTps: row.success_tps,
      throttleCount: row.throttle_count,
      sampleWindowSec: row.sample_window_sec,
      recordedAt: row.recorded_at,
    }));
  }

  async getProviderDetail(providerId: number): Promise<Record<string, unknown>> {
    const [provider, smppConfigs, healthHistory] = await Promise.all([
      this.getProvider(providerId),
      this.databaseService.query<{
        id: number;
        name: string;
        host: string;
        port: number;
        system_id: string;
        bind_mode: string;
        max_sessions: number;
        session_tps: number;
        is_active: boolean;
      }>(
        `
          SELECT id, name, host, port, system_id, bind_mode, max_sessions, session_tps, is_active
          FROM smpp_configs
          WHERE provider_id = $1
          ORDER BY id ASC
        `,
        [providerId],
      ),
      this.getProviderHealthHistory(providerId),
    ]);

    return {
      provider,
      smppConfigs: smppConfigs.rows.map((row) => ({
        id: row.id,
        name: row.name,
        host: row.host,
        port: row.port,
        systemId: row.system_id,
        bindMode: row.bind_mode,
        maxSessions: row.max_sessions,
        sessionTps: row.session_tps,
        isActive: row.is_active,
      })),
      healthHistory,
    };
  }

  private async persistCircuitSnapshot(providerId: number, snapshot: CircuitSnapshot): Promise<void> {
    await this.databaseService.query(
      `
        INSERT INTO provider_circuit_state (
          provider_id,
          state,
          failure_count,
          success_count,
          opened_reason,
          last_changed,
          next_probe_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        ON CONFLICT (provider_id)
        DO UPDATE SET
          state = EXCLUDED.state,
          failure_count = EXCLUDED.failure_count,
          success_count = EXCLUDED.success_count,
          opened_reason = EXCLUDED.opened_reason,
          last_changed = EXCLUDED.last_changed,
          next_probe_at = EXCLUDED.next_probe_at,
          updated_at = now()
      `,
      [
        providerId,
        snapshot.state,
        snapshot.failureCount,
        snapshot.successCount,
        snapshot.lastReason,
        snapshot.lastChangedAt,
        snapshot.nextProbeAt,
      ],
    );
  }

  async setCircuitState(providerId: number, state: CircuitState, reason?: string): Promise<void> {
    const snapshot = await this.circuitBreakerService.setState(providerId, state, undefined, reason);
    await this.persistCircuitSnapshot(providerId, snapshot);
    this.metricsService.setProviderCircuitState(providerId, snapshot.state);
  }

  async assertProviderDispatchAllowed(providerId: number, maxGlobalTps: number): Promise<void> {
    const allowed = await this.circuitBreakerService.allowDispatch(providerId);
    if (!allowed) {
      throw new Error('Provider circuit is open');
    }

    await this.rateLimitService.enforceLimit(`rl:provider:${providerId}:global`, maxGlobalTps, 1);
  }

  async recordDispatchResult(input: {
    providerId: number;
    protocol: 'http' | 'smpp';
    accepted: boolean;
    latencyMs: number;
    errorCode?: string;
    smppConfigId?: number | null;
  }): Promise<void> {
    const snapshot = input.accepted
      ? await this.circuitBreakerService.registerSuccess(input.providerId)
      : await this.circuitBreakerService.registerFailure(input.providerId, input.errorCode);

    await this.persistCircuitSnapshot(input.providerId, snapshot);
    this.metricsService.setProviderCircuitState(input.providerId, snapshot.state);
    this.metricsService.recordDispatchAttempt(
      input.providerId,
      input.protocol,
      input.accepted ? 'accepted' : 'failed',
    );
    if (!input.accepted && input.errorCode) {
      this.metricsService.recordProviderError(input.providerId, input.protocol, input.errorCode);
      if (input.errorCode.includes('throttle')) {
        this.metricsService.recordProviderThrottle(input.providerId, input.protocol);
      }
    }
    await this.databaseService.query(
      `
        INSERT INTO provider_health_logs (
          recorded_date,
          provider_id,
          smpp_config_id,
          protocol,
          status,
          latency_ms,
          error_rate,
          success_tps,
          throttle_count,
          sample_window_sec,
          recorded_at
        )
        VALUES (
          CURRENT_DATE,
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          60,
          now()
        )
      `,
      [
        input.providerId,
        input.smppConfigId ?? null,
        input.protocol,
        snapshot.state === 'closed' ? 'healthy' : 'degraded',
        Math.max(0, Math.round(input.latencyMs)),
        input.accepted ? 0 : 1,
        input.accepted ? 1 : 0,
        input.errorCode?.includes('throttle') ? 1 : 0,
      ],
    );
  }
}
