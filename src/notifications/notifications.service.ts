import { Injectable } from '@nestjs/common';
import { JwtClaims } from '../auth/auth.types';
import { canUseCrossTenantScope, resolveTenantScope } from '../common/utils/tenant-scope';
import { DatabaseService } from '../database/database.service';
import { NotificationsQueryDto } from './dto/notifications-query.dto';

type NotificationItem = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  details: string;
  createdAt: string;
  href: string;
  category: string;
  tenantId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async list(user: JwtClaims, query: NotificationsQueryDto): Promise<Record<string, unknown>> {
    const tenantId = resolveTenantScope(user, query.tenantId);

    const [wallet, senderRejections, failedJobs, fraudEvents] = await Promise.all([
      this.databaseService.query<{
        available_balance_minor: number;
        low_balance_threshold_minor: number;
        updated_at: string;
      }>(
        `
          SELECT available_balance_minor, low_balance_threshold_minor, updated_at
          FROM wallets
          WHERE tenant_id = $1
          LIMIT 1
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        id: number;
        sender_name: string;
        rejection_reason: string | null;
        updated_at: string;
      }>(
        `
          SELECT id, sender_name, rejection_reason, updated_at
          FROM sender_ids
          WHERE tenant_id = $1
            AND status = 'rejected'
          ORDER BY updated_at DESC
          LIMIT 10
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        id: number;
        campaign_id: number;
        last_error: string | null;
        updated_at: string;
      }>(
        `
          SELECT id, campaign_id, last_error, COALESCE(completed_at, started_at, created_at) AS updated_at
          FROM campaign_jobs
          WHERE tenant_id = $1
            AND status = 'failed'
          ORDER BY COALESCE(completed_at, started_at, created_at) DESC
          LIMIT 10
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        message_id: number;
        created_at: string;
        event_type: string;
      }>(
        `
          SELECT message_id, created_at, event_type
          FROM message_logs
          WHERE tenant_id = $1
            AND (
              event_type IN ('submit_throttled', 'failed')
              OR payload::text ILIKE '%fraud%'
            )
          ORDER BY created_at DESC
          LIMIT 10
        `,
        [tenantId],
      ),
    ]);

    const notifications: NotificationItem[] = [];
    const walletRow = wallet.rows[0];
    if (walletRow && walletRow.available_balance_minor <= walletRow.low_balance_threshold_minor) {
      notifications.push({
        id: `wallet-low-balance:${tenantId}`,
        severity: 'critical',
        title: 'Wallet balance is below threshold',
        details: `Available balance has fallen below the configured low-balance threshold for this tenant.`,
        createdAt: walletRow.updated_at,
        href: '/wallet',
        category: 'wallet',
        tenantId,
      });
    }

    notifications.push(
      ...senderRejections.rows.map((row) => ({
        id: `sender-rejected:${row.id}`,
        severity: 'warning' as const,
        title: `Sender ${row.sender_name} was rejected`,
        details: row.rejection_reason ?? 'Rejected during provider review.',
        createdAt: row.updated_at,
        href: '/sender-ids',
        category: 'sender_ids',
        tenantId,
      })),
      ...failedJobs.rows.map((row) => ({
        id: `campaign-job-failed:${row.id}`,
        severity: 'critical' as const,
        title: `Campaign job #${row.id} failed`,
        details: row.last_error ?? `Campaign ${row.campaign_id} has a failed job that needs review.`,
        createdAt: row.updated_at,
        href: `/campaigns/${row.campaign_id}`,
        category: 'campaigns',
        tenantId,
      })),
      ...fraudEvents.rows.map((row) => ({
        id: `fraud-event:${row.message_id}:${row.created_at}`,
        severity: 'warning' as const,
        title: `Policy or fraud event on message #${row.message_id}`,
        details: `Recent ${row.event_type} activity requires review.`,
        createdAt: row.created_at,
        href: '/compliance',
        category: 'fraud',
        tenantId,
      })),
    );

    if (canUseCrossTenantScope(user)) {
      const [providerEvents, opsSnapshot] = await Promise.all([
        this.databaseService.query<{
          provider_id: number;
          status: string;
          recorded_at: string;
        }>(
          `
            SELECT provider_id, status, recorded_at
            FROM provider_health_logs
            WHERE status IN ('degraded', 'down')
              AND recorded_at >= now() - interval '12 hours'
            ORDER BY recorded_at DESC
            LIMIT 10
          `,
        ),
        this.databaseService.query<{
          dlr_backlog: string;
          retry_backlog: string;
          reconciliation_backlog: string;
        }>(
          `
            SELECT
              (SELECT COUNT(*)::text FROM dlr_webhooks WHERE processed = FALSE) AS dlr_backlog,
              (SELECT COUNT(*)::text FROM outbox_events WHERE status IN ('pending', 'publishing')) AS retry_backlog,
              (SELECT COUNT(*)::text FROM reconciliation_events WHERE status = 'pending') AS reconciliation_backlog
          `,
        ),
      ]);

      notifications.push(
        ...providerEvents.rows.map((row) => ({
          id: `provider-health:${row.provider_id}:${row.recorded_at}`,
          severity: row.status === 'down' ? 'critical' as const : 'warning' as const,
          title: `Provider #${row.provider_id} is ${row.status}`,
          details: `Provider health telemetry reported ${row.status} status.`,
          createdAt: row.recorded_at,
          href: `/admin/providers/${row.provider_id}`,
          category: 'providers',
          tenantId: null,
        })),
      );

      const snapshot = opsSnapshot.rows[0];
      if (snapshot && Number(snapshot.dlr_backlog) > 0) {
        notifications.push({
          id: 'ops-dlr-backlog',
          severity: Number(snapshot.dlr_backlog) > 100 ? 'critical' : 'warning',
          title: 'DLR backlog detected',
          details: `${snapshot.dlr_backlog} delivery callbacks are waiting to be processed.`,
          createdAt: new Date().toISOString(),
          href: '/ops/console',
          category: 'operations',
          tenantId: null,
        });
      }
      if (snapshot && Number(snapshot.retry_backlog) > 0) {
        notifications.push({
          id: 'ops-retry-backlog',
          severity: 'warning',
          title: 'Retry backlog detected',
          details: `${snapshot.retry_backlog} pending outbox or retry events are waiting to be published.`,
          createdAt: new Date().toISOString(),
          href: '/ops/console',
          category: 'operations',
          tenantId: null,
        });
      }
      if (snapshot && Number(snapshot.reconciliation_backlog) > 0) {
        notifications.push({
          id: 'ops-reconciliation-backlog',
          severity: 'warning',
          title: 'Reconciliation backlog detected',
          details: `${snapshot.reconciliation_backlog} unmatched or uncertain events need reconciliation.`,
          createdAt: new Date().toISOString(),
          href: '/ops/console',
          category: 'operations',
          tenantId: null,
        });
      }
    }

    return {
      items: notifications
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, query.limit),
    };
  }
}
