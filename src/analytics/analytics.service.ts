import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getSmsSummary(tenantId: string, from?: string, to?: string): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query<{
      accepted_total: string;
      delivered_total: string;
      failed_total: string;
      provider_accepted_total: string;
      p95_latency_seconds: string | null;
    }>(
      `
        SELECT
          COUNT(*)::text AS accepted_total,
          COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered_total,
          COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_total,
          COUNT(*) FILTER (WHERE status = 'provider_accepted')::text AS provider_accepted_total,
          percentile_cont(0.95) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (COALESCE(delivered_at, failed_at, now()) - accepted_at))
          )::text AS p95_latency_seconds
        FROM messages
        WHERE tenant_id = $1
          AND accepted_at >= COALESCE($2::timestamptz, now() - interval '24 hours')
          AND accepted_at <= COALESCE($3::timestamptz, now())
      `,
      [tenantId, from ?? null, to ?? null],
    );

    const row = result.rows[0] ?? {
      accepted_total: '0',
      delivered_total: '0',
      failed_total: '0',
      provider_accepted_total: '0',
      p95_latency_seconds: '0',
    };
    const accepted = Number(row.accepted_total ?? 0);
    const delivered = Number(row.delivered_total ?? 0);

    return {
      acceptedTotal: accepted,
      deliveredTotal: delivered,
      failedTotal: Number(row.failed_total ?? 0),
      providerAcceptedTotal: Number(row.provider_accepted_total ?? 0),
      deliveryRate: accepted === 0 ? 0 : delivered / accepted,
      p95LatencySeconds: Number(row.p95_latency_seconds ?? 0),
    };
  }

  async getProviderHealth(from?: string, to?: string): Promise<Record<string, unknown>[]> {
    const result = await this.databaseService.query<{
      provider_id: number;
      avg_latency_ms: string | null;
      avg_error_rate: string | null;
      latest_status: string;
    }>(
      `
        SELECT DISTINCT ON (provider_id)
          provider_id,
          AVG(latency_ms) OVER (PARTITION BY provider_id)::text AS avg_latency_ms,
          AVG(error_rate) OVER (PARTITION BY provider_id)::text AS avg_error_rate,
          status AS latest_status
        FROM provider_health_logs
        WHERE recorded_at >= COALESCE($1::timestamptz, now() - interval '24 hours')
          AND recorded_at <= COALESCE($2::timestamptz, now())
        ORDER BY provider_id, recorded_at DESC
      `,
      [from ?? null, to ?? null],
    );

    return result.rows.map((row) => ({
      providerId: row.provider_id,
      avgLatencyMs: Number(row.avg_latency_ms ?? 0),
      avgErrorRate: Number(row.avg_error_rate ?? 0),
      latestStatus: row.latest_status,
    }));
  }
}
