import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MetricsService } from './metrics.service';
import { RuntimeRoleService } from '../../runtime/runtime-role.service';

@Injectable()
export class OperationalMetricsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly metricsService: MetricsService,
    private readonly runtimeRoleService: RuntimeRoleService,
  ) {}

  onModuleInit(): void {
    if (!this.runtimeRoleService.hasCapability('http')) {
      return;
    }

    this.timer = setInterval(() => {
      void this.collect();
    }, 15000);
    void this.collect();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async collect(): Promise<void> {
    const [outbox, dlr, reconciliation, campaigns] = await Promise.all([
      this.databaseService.query<{ backlog: string; failed: string }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status IN ('pending', 'publishing'))::text AS backlog,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
          FROM outbox_events
        `,
      ),
      this.databaseService.query<{ backlog: string }>(
        `
          SELECT COUNT(*)::text AS backlog
          FROM dlr_webhooks
          WHERE processed = FALSE
        `,
      ),
      this.databaseService.query<{ backlog: string }>(
        `
          SELECT COUNT(*)::text AS backlog
          FROM reconciliation_events
          WHERE status = 'pending'
        `,
      ),
      this.databaseService.query<{ running: string; failed: string }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status IN ('queued', 'running', 'expanding'))::text AS running,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
          FROM campaign_jobs
        `,
      ),
    ]);

    this.metricsService.setOutboxBacklog('pending', Number(outbox.rows[0]?.backlog ?? 0));
    this.metricsService.setOutboxBacklog('failed', Number(outbox.rows[0]?.failed ?? 0));
    this.metricsService.setReconciliationBacklog(Number(reconciliation.rows[0]?.backlog ?? 0));
    this.metricsService.setDlrBacklog(Number(dlr.rows[0]?.backlog ?? 0));
    this.metricsService.setCampaignJobsGauge('running', Number(campaigns.rows[0]?.running ?? 0));
    this.metricsService.setCampaignJobsGauge('failed', Number(campaigns.rows[0]?.failed ?? 0));
  }
}
