'use client';

import { AppCard, MetricCard, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { LastUpdatedIndicator } from '@/components/ui/last-updated-indicator';
import { RoleGuard } from '@/components/role-guard';
import { useOperationsOverviewQuery } from '@/lib/hooks';
import { useRealtimeStatus } from '@/lib/realtime';
import { formatDateTime } from '@/lib/utils';

export default function OperationsConsolePage(): React.ReactElement {
  const overview = useOperationsOverviewQuery();
  const realtime = useRealtimeStatus(overview);

  if (overview.isError) {
    return <ErrorPanel title="Operations overview unavailable" error={overview.error} onRetry={() => overview.refetch()} />;
  }

  if (!overview.data) {
    return <ErrorPanel title="Operations overview unavailable" error={new Error('No operations snapshot was returned.')} onRetry={() => overview.refetch()} />;
  }

  const data = overview.data;
  const queueColumns: DataGridColumn<(typeof data.queues)[number]>[] = [
    { id: 'topicName', header: 'Topic', accessor: (row) => row.topicName, cell: (row) => row.topicName },
    { id: 'backlog', header: 'Backlog', accessor: (row) => row.backlog, cell: (row) => String(row.backlog) },
    { id: 'failed', header: 'Failed', accessor: (row) => row.failed, cell: (row) => String(row.failed) },
  ];
  const providerColumns: DataGridColumn<(typeof data.providers)[number]>[] = [
    { id: 'providerId', header: 'Provider', accessor: (row) => row.providerId, cell: (row) => `Provider #${row.providerId}` },
    { id: 'health', header: 'Health', accessor: (row) => row.latestStatus, cell: (row) => <StatusBadge value={row.latestStatus} /> },
    { id: 'circuit', header: 'Circuit', accessor: (row) => row.circuitState, cell: (row) => <StatusBadge value={row.circuitState} /> },
    { id: 'latency', header: 'Latency', accessor: (row) => row.avgLatencyMs, cell: (row) => `${row.avgLatencyMs.toFixed(0)} ms` },
  ];
  const outageColumns: DataGridColumn<(typeof data.recentOutages)[number]>[] = [
    { id: 'provider', header: 'Provider', accessor: (row) => row.providerId, cell: (row) => `Provider #${row.providerId}` },
    { id: 'status', header: 'Status', accessor: (row) => row.status, cell: (row) => <StatusBadge value={row.status} /> },
    { id: 'recordedAt', header: 'Recorded', accessor: (row) => row.recordedAt, cell: (row) => formatDateTime(row.recordedAt) },
  ];
  const anomalyColumns: DataGridColumn<(typeof data.tenantAnomalies)[number]>[] = [
    { id: 'tenant', header: 'Tenant', accessor: (row) => row.tenantId, cell: (row) => row.tenantId },
    { id: 'failures', header: 'Failures (1h)', accessor: (row) => row.failureCount, cell: (row) => String(row.failureCount) },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'support']}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operations"
          title="NOC console"
          description="Watch queue pressure, provider circuit posture, DLR backlog, reconciliation backlog, and cross-tenant anomalies."
          actions={<LastUpdatedIndicator lastUpdatedAt={realtime.lastUpdatedAt} stateLabel={realtime.stateLabel} isOnline={realtime.isOnline} />}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="DLR backlog" value={String(data.dlrBacklog.backlog)} hint={data.dlrBacklog.oldestReceivedAt ? `Oldest ${formatDateTime(data.dlrBacklog.oldestReceivedAt)}` : 'No pending callbacks'} />
          <MetricCard label="Reconciliation backlog" value={String(data.reconciliationBacklog)} />
          <MetricCard label="Running jobs" value={String(data.campaignJobs.running)} />
          <MetricCard label="Failed jobs" value={String(data.campaignJobs.failed)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <AppCard>
            <h2 className="mb-4 text-lg font-semibold text-slate-950">Queue depth</h2>
            <DataGrid columns={queueColumns} data={data.queues} getRowId={(row) => row.topicName} />
          </AppCard>

          <AppCard>
            <h2 className="mb-4 text-lg font-semibold text-slate-950">Provider circuits</h2>
            <DataGrid columns={providerColumns} data={data.providers} getRowId={(row) => row.providerId} />
          </AppCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <AppCard>
            <h2 className="mb-4 text-lg font-semibold text-slate-950">Recent outages</h2>
            <DataGrid columns={outageColumns} data={data.recentOutages} getRowId={(row) => `${row.providerId}-${row.recordedAt}`} />
          </AppCard>
          <AppCard>
            <h2 className="mb-4 text-lg font-semibold text-slate-950">Cross-tenant anomalies</h2>
            <DataGrid columns={anomalyColumns} data={data.tenantAnomalies} getRowId={(row) => row.tenantId} />
          </AppCard>
        </div>
      </div>
    </RoleGuard>
  );
}
