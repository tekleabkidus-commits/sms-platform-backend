'use client';

import { use } from 'react';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { LastUpdatedIndicator } from '@/components/ui/last-updated-indicator';
import { RoleGuard } from '@/components/role-guard';
import { AppCard, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { useProviderDetailQuery } from '@/lib/hooks';
import { useRealtimeStatus } from '@/lib/realtime';
import { formatDateTime } from '@/lib/utils';

export default function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const resolvedParams = use(params);
  const provider = useProviderDetailQuery(Number(resolvedParams.id));
  const realtime = useRealtimeStatus(provider);

  if (provider.isError) {
    return <ErrorPanel title="Provider unavailable" error={provider.error} onRetry={() => provider.refetch()} />;
  }

  if (!provider.data) {
    return <ErrorPanel title="Provider unavailable" error={new Error('No provider detail was returned.')} onRetry={() => provider.refetch()} />;
  }

  const detail = provider.data;
  const smppColumns: DataGridColumn<(typeof detail.smppConfigs)[number]>[] = [
    { id: 'name', header: 'Name', accessor: (row) => row.name, cell: (row) => row.name },
    { id: 'host', header: 'Host', accessor: (row) => row.host, cell: (row) => row.host },
    { id: 'port', header: 'Port', accessor: (row) => row.port, cell: (row) => String(row.port) },
    { id: 'sessions', header: 'Sessions', accessor: (row) => row.maxSessions, cell: (row) => String(row.maxSessions) },
    { id: 'tps', header: 'TPS', accessor: (row) => row.sessionTps, cell: (row) => String(row.sessionTps) },
    { id: 'active', header: 'Active', accessor: (row) => row.isActive ? 1 : 0, cell: (row) => <StatusBadge value={row.isActive ? 'active' : 'inactive'} /> },
  ];
  const healthColumns: DataGridColumn<(typeof detail.healthHistory)[number]>[] = [
    { id: 'protocol', header: 'Protocol', accessor: (row) => row.protocol, cell: (row) => row.protocol },
    { id: 'status', header: 'Status', accessor: (row) => row.status, cell: (row) => <StatusBadge value={row.status} /> },
    { id: 'latency', header: 'Latency', accessor: (row) => row.latencyMs ?? 0, cell: (row) => `${row.latencyMs ?? 0} ms` },
    { id: 'errorRate', header: 'Error rate', accessor: (row) => row.errorRate, cell: (row) => `${(row.errorRate * 100).toFixed(1)}%` },
    { id: 'recordedAt', header: 'Recorded', accessor: (row) => row.recordedAt, cell: (row) => formatDateTime(row.recordedAt) },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'support']}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Provider detail"
          title={detail.provider.name}
          description="Connector topology, recent health samples, and live circuit controls."
          actions={(
            <div className="flex flex-wrap gap-2">
              <LastUpdatedIndicator lastUpdatedAt={realtime.lastUpdatedAt} stateLabel={realtime.stateLabel} isOnline={realtime.isOnline} />
              {(['closed', 'half_open', 'open'] as const).map((state) => (
                <ConfirmButton
                  key={state}
                  variant={state === 'open' ? 'danger' : state === 'half_open' ? 'secondary' : 'ghost'}
                  title={`Set circuit to ${state}`}
                  confirmText={`This will force provider ${detail.provider.name} into ${state} state for all connector instances.`}
                  requireText={state === 'open' ? detail.provider.code : undefined}
                  requireReauth
                  confirmLabel={`Set ${state}`}
                  onConfirm={async ({ reauthToken } = {}) => {
                    await apiRequest(`/providers/${detail.provider.id}/circuit`, {
                      method: 'POST',
                      headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
                      body: JSON.stringify({ state, reason: `Set from control plane: ${state}` }),
                    });
                    toast.success(`Circuit set to ${state}.`);
                    await provider.refetch();
                  }}
                >
                  {state}
                </ConfirmButton>
              ))}
            </div>
          )}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <AppCard>
            <h2 className="mb-4 text-lg font-semibold text-slate-950">SMPP configs</h2>
            <DataGrid columns={smppColumns} data={detail.smppConfigs} getRowId={(row) => row.id} loading={provider.isLoading} visibilityStorageKey="provider-detail-smpp-columns" />
          </AppCard>
          <AppCard>
            <h2 className="mb-4 text-lg font-semibold text-slate-950">Health history</h2>
            <DataGrid columns={healthColumns} data={detail.healthHistory} getRowId={(row) => row.recordedAt} loading={provider.isLoading} visibilityStorageKey="provider-detail-health-columns" />
          </AppCard>
        </div>
      </div>
    </RoleGuard>
  );
}
