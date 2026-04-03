'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { SavedViewsManager } from '@/components/ui/saved-views-manager';
import { AppCard, Button, Field, Input, PageHeader } from '@/components/ui/primitives';
import { downloadCsv } from '@/lib/csv';
import { useAuditLogsQuery } from '@/lib/hooks';
import { useSavedViews } from '@/lib/saved-views';
import { useUrlFilters } from '@/lib/use-url-filters';
import { AuditLogItem } from '@/lib/api-types';
import { formatDateTime } from '@/lib/utils';

const DEFAULT_FILTERS = {
  action: '',
  userId: '',
  apiKeyId: '',
  from: '',
  to: '',
  page: '1',
  limit: '25',
};

const COLUMNS: DataGridColumn<AuditLogItem>[] = [
  {
    id: 'action',
    header: 'Action',
    accessor: (row) => row.action,
    cell: (log) => (
      <div>
        <p className="font-medium text-slate-900">{log.action}</p>
        <p className="text-xs text-slate-500">{JSON.stringify(log.metadata)}</p>
      </div>
    ),
  },
  {
    id: 'target',
    header: 'Target',
    accessor: (row) => `${row.targetType ?? ''}-${row.targetId ?? ''}`,
    cell: (log) => (
      <div className="space-y-1">
        <p>{log.targetType ?? '—'} / {log.targetId ?? '—'}</p>
        {log.targetId ? <CopyButton value={log.targetId} label="Copy audit target ID" /> : null}
      </div>
    ),
  },
  {
    id: 'principal',
    header: 'User / API key',
    accessor: (row) => row.userId ?? row.apiKeyId ?? 'system',
    cell: (log) => (
      <div className="space-y-1">
        <p>{log.userId ?? log.apiKeyId ?? 'system'}</p>
        {log.userId ?? log.apiKeyId ? <CopyButton value={log.userId ?? log.apiKeyId ?? ''} label="Copy principal ID" /> : null}
      </div>
    ),
  },
  {
    id: 'created',
    header: 'Created',
    accessor: (row) => row.createdAt,
    cell: (log) => formatDateTime(log.createdAt),
  },
];

export default function AuditPage(): React.ReactElement {
  const appliedDefaultRef = useRef(false);
  const { filters, updateFilters, applyFilters, queryString } = useUrlFilters(DEFAULT_FILTERS);
  const logs = useAuditLogsQuery(queryString);
  const savedViews = useSavedViews('audit');

  useEffect(() => {
    if (!appliedDefaultRef.current && !queryString && savedViews.defaultView) {
      appliedDefaultRef.current = true;
      applyFilters({ ...DEFAULT_FILTERS, ...savedViews.defaultView.filters });
    }
  }, [applyFilters, queryString, savedViews.defaultView]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit"
        title="Security and activity history"
        description="Filter state-changing operations across auth, wallet, sender review, routing, and provider actions."
        actions={(
          <Button
            type="button"
            variant="ghost"
            disabled={!logs.data?.items.length}
            onClick={() => {
              if (!logs.data?.items.length) {
                return;
              }
              downloadCsv({
                filename: 'audit-logs.csv',
                columns: [
                  { header: 'Action', value: (row) => row.action },
                  { header: 'Target Type', value: (row) => row.targetType ?? '' },
                  { header: 'Target ID', value: (row) => row.targetId ?? '' },
                  { header: 'User ID', value: (row) => row.userId ?? '' },
                  { header: 'API Key ID', value: (row) => row.apiKeyId ?? '' },
                  { header: 'Source IP', value: (row) => row.sourceIp ?? '' },
                  { header: 'Created At', value: (row) => row.createdAt },
                ],
                rows: logs.data.items as unknown as Record<string, unknown>[],
              });
              toast.success('Audit export downloaded.');
            }}
          >
            Export CSV
          </Button>
        )}
      />

      <SavedViewsManager
        views={savedViews.views}
        onSave={(name, setDefault) => {
          savedViews.saveView(name, filters, setDefault);
          toast.success('Saved audit view updated.');
        }}
        onLoad={(id) => {
          const view = savedViews.views.find((entry) => entry.id === id);
          if (!view) {
            return;
          }
          applyFilters({ ...DEFAULT_FILTERS, ...view.filters });
        }}
        onDelete={(id) => {
          savedViews.removeView(id);
          toast.success('Saved audit view removed.');
        }}
        onSetDefault={(id) => savedViews.setDefaultView(id)}
      />

      <AppCard className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Action">
          <Input value={filters.action} placeholder="wallet.debit" onChange={(event) => updateFilters({ action: event.target.value })} onBlur={() => applyFilters({ ...filters, page: '1' })} />
        </Field>
        <Field label="User ID">
          <Input value={filters.userId} placeholder="UUID" onChange={(event) => updateFilters({ userId: event.target.value })} onBlur={() => applyFilters({ ...filters, page: '1' })} />
        </Field>
        <Field label="API key ID">
          <Input value={filters.apiKeyId} placeholder="UUID" onChange={(event) => updateFilters({ apiKeyId: event.target.value })} onBlur={() => applyFilters({ ...filters, page: '1' })} />
        </Field>
        <Field label="From">
          <Input type="datetime-local" value={filters.from} onChange={(event) => updateFilters({ from: event.target.value })} onBlur={() => applyFilters({ ...filters, page: '1' })} />
        </Field>
        <Field label="To">
          <Input type="datetime-local" value={filters.to} onChange={(event) => updateFilters({ to: event.target.value })} onBlur={() => applyFilters({ ...filters, page: '1' })} />
        </Field>
      </AppCard>

      <DataGrid
        columns={COLUMNS}
        data={logs.data?.items ?? []}
        getRowId={(row) => `${row.logDate}-${row.id}`}
        emptyMessage="No audit events matched the current filters."
        loading={logs.isLoading}
        error={logs.isError ? <ErrorPanel title="Audit logs unavailable" error={logs.error} onRetry={() => logs.refetch()} /> : undefined}
        pagination={logs.data ? {
          page: logs.data.pagination.page,
          pageSize: logs.data.pagination.limit,
          total: logs.data.pagination.total,
          onPageChange: (page) => applyFilters({ ...filters, page: String(page) }),
          onPageSizeChange: (pageSize) => applyFilters({ ...filters, page: '1', limit: String(pageSize) }),
        } : undefined}
        visibilityStorageKey="audit-grid-columns"
      />
    </div>
  );
}
