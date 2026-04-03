import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class OperationsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getOverview(): Promise<Record<string, unknown>> {
    const [queues, providers, dlrBacklog, reconciliation, campaignJobs, outages, anomalies] = await Promise.all([
      this.databaseService.query<{
        topic_name: string;
        backlog: string;
        failed: string;
      }>(
        `
          SELECT
            topic_name,
            COUNT(*) FILTER (WHERE status IN ('pending', 'publishing'))::text AS backlog,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
          FROM outbox_events
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY topic_name
          ORDER BY topic_name ASC
        `,
      ),
      this.databaseService.query<{
        provider_id: number;
        latest_status: string;
        avg_latency_ms: string | null;
        avg_error_rate: string | null;
        circuit_state: string;
      }>(
        `
          SELECT DISTINCT ON (ph.provider_id)
            ph.provider_id,
            ph.status AS latest_status,
            AVG(ph.latency_ms) OVER (PARTITION BY ph.provider_id)::text AS avg_latency_ms,
            AVG(ph.error_rate) OVER (PARTITION BY ph.provider_id)::text AS avg_error_rate,
            pcs.state AS circuit_state
          FROM provider_health_logs ph
          LEFT JOIN provider_circuit_state pcs ON pcs.provider_id = ph.provider_id
          WHERE ph.recorded_at >= now() - interval '24 hours'
          ORDER BY ph.provider_id, ph.recorded_at DESC
        `,
      ),
      this.databaseService.query<{
        backlog: string;
        oldest_received_at: string | null;
      }>(
        `
          SELECT COUNT(*)::text AS backlog, MIN(received_at)::text AS oldest_received_at
          FROM dlr_webhooks
          WHERE processed = FALSE
        `,
      ),
      this.databaseService.query<{
        backlog: string;
      }>(
        `
          SELECT COUNT(*)::text AS backlog
          FROM reconciliation_events
          WHERE status = 'pending'
        `,
      ),
      this.databaseService.query<{
        running_jobs: string;
        failed_jobs: string;
      }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status IN ('queued', 'running', 'expanding'))::text AS running_jobs,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_jobs
          FROM campaign_jobs
          WHERE created_at >= now() - interval '24 hours'
        `,
      ),
      this.databaseService.query<{
        provider_id: number;
        status: string;
        recorded_at: string;
      }>(
        `
          SELECT provider_id, status, recorded_at
          FROM provider_health_logs
          WHERE status IN ('degraded', 'down')
            AND recorded_at >= now() - interval '24 hours'
          ORDER BY recorded_at DESC
          LIMIT 20
        `,
      ),
      this.databaseService.query<{
        tenant_id: string;
        failure_count: string;
      }>(
        `
          SELECT tenant_id, COUNT(*)::text AS failure_count
          FROM messages
          WHERE failed_at >= now() - interval '1 hour'
          GROUP BY tenant_id
          ORDER BY COUNT(*) DESC
          LIMIT 10
        `,
      ),
    ]);

    return {
      queues: queues.rows.map((row) => ({
        topicName: row.topic_name,
        backlog: Number(row.backlog),
        failed: Number(row.failed),
      })),
      providers: providers.rows.map((row) => ({
        providerId: row.provider_id,
        latestStatus: row.latest_status,
        avgLatencyMs: Number(row.avg_latency_ms ?? 0),
        avgErrorRate: Number(row.avg_error_rate ?? 0),
        circuitState: row.circuit_state ?? 'closed',
      })),
      dlrBacklog: {
        backlog: Number(dlrBacklog.rows[0]?.backlog ?? 0),
        oldestReceivedAt: dlrBacklog.rows[0]?.oldest_received_at ?? null,
      },
      reconciliationBacklog: Number(reconciliation.rows[0]?.backlog ?? 0),
      campaignJobs: {
        running: Number(campaignJobs.rows[0]?.running_jobs ?? 0),
        failed: Number(campaignJobs.rows[0]?.failed_jobs ?? 0),
      },
      recentOutages: outages.rows.map((row) => ({
        providerId: row.provider_id,
        status: row.status,
        recordedAt: row.recorded_at,
      })),
      tenantAnomalies: anomalies.rows.map((row) => ({
        tenantId: row.tenant_id,
        failureCount: Number(row.failure_count),
      })),
    };
  }
}
