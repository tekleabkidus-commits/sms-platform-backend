import { Injectable } from '@nestjs/common';
import { JwtClaims } from '../auth/auth.types';
import { resolveTenantScope } from '../common/utils/tenant-scope';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DashboardService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getTenantDashboard(user: JwtClaims, requestedTenantId?: string): Promise<Record<string, unknown>> {
    const tenantId = resolveTenantScope(user, requestedTenantId);

    const [wallet, counts, campaignSummary, senderSummary, providerSummary, recentFailures, fraudWarnings, apiKeyUsage, trend] = await Promise.all([
      this.databaseService.query<{
        available_balance_minor: number;
        reserved_balance_minor: number;
        currency: string;
      }>(
        `
          SELECT available_balance_minor, reserved_balance_minor, currency
          FROM wallets
          WHERE tenant_id = $1
          LIMIT 1
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        accepted_total: string;
        delivered_total: string;
        failed_total: string;
        current_tps_usage: string;
      }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE accepted_at >= date_trunc('day', now()))::text AS accepted_total,
            COUNT(*) FILTER (WHERE delivered_at >= date_trunc('day', now()))::text AS delivered_total,
            COUNT(*) FILTER (WHERE failed_at >= date_trunc('day', now()))::text AS failed_total,
            COUNT(*) FILTER (WHERE accepted_at >= now() - interval '1 minute')::text AS current_tps_usage
          FROM messages
          WHERE tenant_id = $1
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        total_campaigns: string;
        scheduled_campaigns: string;
        active_schedules: string;
        running_jobs: string;
      }>(
        `
          SELECT
            (SELECT COUNT(*)::text FROM campaigns WHERE tenant_id = $1) AS total_campaigns,
            (SELECT COUNT(*)::text FROM campaigns WHERE tenant_id = $1 AND status = 'scheduled') AS scheduled_campaigns,
            (SELECT COUNT(*)::text FROM campaign_schedules WHERE tenant_id = $1 AND is_active = TRUE) AS active_schedules,
            (SELECT COUNT(*)::text FROM campaign_jobs WHERE tenant_id = $1 AND status IN ('queued', 'running', 'expanding')) AS running_jobs
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        approved_total: string;
        pending_total: string;
        rejected_total: string;
      }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status = 'approved')::text AS approved_total,
            COUNT(*) FILTER (WHERE status = 'pending')::text AS pending_total,
            COUNT(*) FILTER (WHERE status = 'rejected')::text AS rejected_total
          FROM sender_ids
          WHERE tenant_id = $1
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        provider_id: number;
        latest_status: string;
        avg_latency_ms: string | null;
        avg_error_rate: string | null;
      }>(
        `
          SELECT DISTINCT ON (ph.provider_id)
            ph.provider_id,
            ph.status AS latest_status,
            AVG(ph.latency_ms) OVER (PARTITION BY ph.provider_id)::text AS avg_latency_ms,
            AVG(ph.error_rate) OVER (PARTITION BY ph.provider_id)::text AS avg_error_rate
          FROM provider_health_logs ph
          INNER JOIN messages m ON m.provider_id = ph.provider_id AND m.tenant_id = $1
          WHERE ph.recorded_at >= now() - interval '24 hours'
            AND m.accepted_at >= now() - interval '7 days'
          ORDER BY ph.provider_id, ph.recorded_at DESC
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        id: number;
        submit_date: string;
        phone_number: string;
        status: string;
        last_error_code: string | null;
        last_error_message: string | null;
        accepted_at: string;
      }>(
        `
          SELECT id, submit_date, phone_number, status, last_error_code, last_error_message, accepted_at
          FROM messages
          WHERE tenant_id = $1
            AND status = 'failed'
          ORDER BY accepted_at DESC
          LIMIT 8
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        warnings: string;
      }>(
        `
          SELECT COUNT(*)::text AS warnings
          FROM message_logs
          WHERE tenant_id = $1
            AND created_at >= now() - interval '24 hours'
            AND (event_type = 'submit_throttled' OR payload::text ILIKE '%fraud%')
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        api_key_id: string | null;
        message_count: string;
      }>(
        `
          SELECT api_key_id, COUNT(*)::text AS message_count
          FROM messages
          WHERE tenant_id = $1
            AND accepted_at >= now() - interval '24 hours'
          GROUP BY api_key_id
          ORDER BY COUNT(*) DESC
          LIMIT 5
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        bucket_date: string;
        accepted_total: string;
        delivered_total: string;
        spend_minor: string;
        cost_minor: string;
      }>(
        `
          SELECT
            date_trunc('day', accepted_at)::date::text AS bucket_date,
            COUNT(*)::text AS accepted_total,
            COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered_total,
            COALESCE(SUM(price_minor), 0)::text AS spend_minor,
            COALESCE(SUM(cost_minor), 0)::text AS cost_minor
          FROM messages
          WHERE tenant_id = $1
            AND accepted_at >= now() - interval '7 days'
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        [tenantId],
      ),
    ]);

    return {
      wallet: {
        availableBalanceMinor: wallet.rows[0]?.available_balance_minor ?? 0,
        reservedBalanceMinor: wallet.rows[0]?.reserved_balance_minor ?? 0,
        currency: wallet.rows[0]?.currency ?? 'ETB',
      },
      today: {
        sent: Number(counts.rows[0]?.accepted_total ?? 0),
        delivered: Number(counts.rows[0]?.delivered_total ?? 0),
        failed: Number(counts.rows[0]?.failed_total ?? 0),
        currentTpsUsage: Number(counts.rows[0]?.current_tps_usage ?? 0) / 60,
      },
      campaigns: {
        total: Number(campaignSummary.rows[0]?.total_campaigns ?? 0),
        scheduled: Number(campaignSummary.rows[0]?.scheduled_campaigns ?? 0),
        activeSchedules: Number(campaignSummary.rows[0]?.active_schedules ?? 0),
        runningJobs: Number(campaignSummary.rows[0]?.running_jobs ?? 0),
      },
      senderIds: {
        approved: Number(senderSummary.rows[0]?.approved_total ?? 0),
        pending: Number(senderSummary.rows[0]?.pending_total ?? 0),
        rejected: Number(senderSummary.rows[0]?.rejected_total ?? 0),
      },
      providers: providerSummary.rows.map((row) => ({
        providerId: row.provider_id,
        latestStatus: row.latest_status,
        avgLatencyMs: Number(row.avg_latency_ms ?? 0),
        avgErrorRate: Number(row.avg_error_rate ?? 0),
      })),
      recentFailures: recentFailures.rows.map((row) => ({
        id: row.id,
        submitDate: row.submit_date,
        phoneNumber: row.phone_number,
        status: row.status,
        lastErrorCode: row.last_error_code,
        lastErrorMessage: row.last_error_message,
        acceptedAt: row.accepted_at,
      })),
      fraudWarnings: Number(fraudWarnings.rows[0]?.warnings ?? 0),
      apiKeyUsage: apiKeyUsage.rows.map((row) => ({
        apiKeyId: row.api_key_id,
        messageCount: Number(row.message_count),
      })),
      trends: trend.rows.map((row) => ({
        date: row.bucket_date,
        acceptedTotal: Number(row.accepted_total),
        deliveredTotal: Number(row.delivered_total),
        deliveryRate: Number(row.accepted_total) === 0 ? 0 : Number(row.delivered_total) / Number(row.accepted_total),
        spendMinor: Number(row.spend_minor),
        costMinor: Number(row.cost_minor),
      })),
    };
  }
}
