'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { LastUpdatedIndicator } from '@/components/ui/last-updated-indicator';
import { AppCard, Button, Field, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { RoleGuard } from '@/components/role-guard';
import { downloadCsv } from '@/lib/csv';
import { useProvidersQuery } from '@/lib/hooks';
import { useUrlFilters } from '@/lib/use-url-filters';
import { useRealtimeStatus } from '@/lib/realtime';
import { ProviderItem } from '@/lib/api-types';

const DEFAULT_FILTERS = {
  search: '',
  healthStatus: '',
  page: '1',
  limit: '10',
};

const COLUMNS: DataGridColumn<ProviderItem>[] = [
  {
    id: 'provider',
    header: 'Provider',
    accessor: (row) => row.name,
    cell: (provider) => (
      <div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/providers/${provider.id}`} className="font-semibold text-slate-950 hover:text-teal-700">
            {provider.name}
          </Link>
          <CopyButton value={String(provider.id)} label="Copy provider ID" />
        </div>
        <p className="text-xs text-slate-500">{provider.code}</p>
      </div>
    ),
  },
  {
    id: 'protocol',
    header: 'Protocol',
    accessor: (row) => row.defaultProtocol,
    cell: (provider) => provider.defaultProtocol,
  },
  {
    id: 'health',
    header: 'Health',
    accessor: (row) => row.healthStatus,
    cell: (provider) => <StatusBadge value={provider.healthStatus} />,
  },
  {
    id: 'circuit',
    header: 'Circuit',
    accessor: (row) => row.metrics.circuitState,
    cell: (provider) => <StatusBadge value={provider.metrics.circuitState} />,
  },
  {
    id: 'latency',
    header: 'Latency',
    accessor: (row) => row.metrics.latencyMs,
    cell: (provider) => `${provider.metrics.latencyMs.toFixed(0)} ms`,
  },
];

export default function ProvidersPage(): React.ReactElement {
  const providers = useProvidersQuery();
  const realtime = useRealtimeStatus(providers);
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);

  const filteredProviders = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (providers.data ?? []).filter((provider) => {
      if (filters.healthStatus && provider.healthStatus !== filters.healthStatus) {
        return false;
      }
      if (!search) {
        return true;
      }
      return provider.name.toLowerCase().includes(search)
        || provider.code.toLowerCase().includes(search)
        || String(provider.id) === search;
    });
  }, [filters.healthStatus, filters.search, providers.data]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const pagedProviders = filteredProviders.slice((page - 1) * pageSize, page * pageSize);

  return (
    <RoleGuard allowedRoles={['admin', 'support']}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Admin"
          title="Providers and connector posture"
          description="Inspect current health, circuit state, and connector metadata before applying overrides."
          actions={(
            <div className="flex flex-wrap gap-3">
              <LastUpdatedIndicator lastUpdatedAt={realtime.lastUpdatedAt} stateLabel={realtime.stateLabel} isOnline={realtime.isOnline} />
              <Button
                type="button"
                variant="ghost"
                disabled={filteredProviders.length === 0}
                onClick={() => {
                  downloadCsv({
                    filename: 'providers.csv',
                    columns: [
                      { header: 'Provider ID', value: (row) => row.id },
                      { header: 'Code', value: (row) => row.code },
                      { header: 'Name', value: (row) => row.name },
                      { header: 'Health', value: (row) => row.healthStatus },
                      { header: 'Circuit', value: (row) => row.circuitState },
                    ],
                    rows: filteredProviders.map((provider) => ({
                      id: provider.id,
                      code: provider.code,
                      name: provider.name,
                      healthStatus: provider.healthStatus,
                      circuitState: provider.metrics.circuitState,
                    })),
                  });
                  toast.success('Provider export downloaded.');
                }}
              >
                Export CSV
              </Button>
            </div>
          )}
        />

        <AppCard className="grid gap-4 md:grid-cols-2">
          <Field label="Search">
            <Input value={filters.search} placeholder="Provider name, code, or ID" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
          </Field>
          <Field label="Health">
            <Select value={filters.healthStatus} onChange={(event) => applyFilters({ ...filters, healthStatus: event.target.value, page: '1' })}>
              <option value="">All statuses</option>
              <option value="healthy">Healthy</option>
              <option value="degraded">Degraded</option>
              <option value="down">Down</option>
            </Select>
          </Field>
        </AppCard>

        <DataGrid
          columns={COLUMNS}
          data={pagedProviders}
          getRowId={(row) => row.id}
          emptyMessage="No providers matched the current filters."
          loading={providers.isLoading}
          error={providers.isError ? <ErrorPanel title="Providers unavailable" error={providers.error} onRetry={() => providers.refetch()} /> : undefined}
          pagination={{
            page,
            pageSize,
            total: filteredProviders.length,
            onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
            onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
          }}
          visibilityStorageKey="providers-grid-columns"
        />
      </div>
    </RoleGuard>
  );
}
