import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CircuitBreakerService, CircuitState } from '../redis/circuit-breaker.service';

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

  async setCircuitState(providerId: number, state: CircuitState, reason?: string): Promise<void> {
    await this.circuitBreakerService.setState(providerId, state);
    await this.databaseService.query(
      `
        INSERT INTO provider_circuit_state (provider_id, state, opened_reason, last_changed, updated_at)
        VALUES ($1, $2, $3, now(), now())
        ON CONFLICT (provider_id)
        DO UPDATE SET
          state = EXCLUDED.state,
          opened_reason = EXCLUDED.opened_reason,
          last_changed = now(),
          updated_at = now()
      `,
      [providerId, state, reason ?? null],
    );
  }
}
