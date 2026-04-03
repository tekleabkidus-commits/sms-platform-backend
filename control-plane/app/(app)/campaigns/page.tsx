'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { SavedViewsManager } from '@/components/ui/saved-views-manager';
import { AppCard, Button, Field, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { downloadCsv } from '@/lib/csv';
import { useCampaignsQuery } from '@/lib/hooks';
import { useSavedViews } from '@/lib/saved-views';
import { useUrlFilters } from '@/lib/use-url-filters';
import { CampaignSummary } from '@/lib/api-types';
import { formatDateTime } from '@/lib/utils';

const DEFAULT_FILTERS = {
  search: '',
  status: '',
  page: '1',
  limit: '10',
};

const COLUMNS: DataGridColumn<CampaignSummary>[] = [
  {
    id: 'campaign',
    header: 'Campaign',
    accessor: (row) => row.name,
    cell: (campaign) => (
      <div>
        <div className="flex items-center gap-2">
          <Link href={`/campaigns/${campaign.id}`} className="font-semibold text-slate-950 hover:text-teal-700">
            {campaign.name}
          </Link>
          <CopyButton value={String(campaign.id)} label="Copy campaign ID" />
        </div>
        <p className="text-xs text-slate-500">{campaign.sourceType}</p>
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessor: (row) => row.status,
    cell: (campaign) => <StatusBadge value={campaign.status} />,
  },
  {
    id: 'schedule',
    header: 'Schedule',
    accessor: (row) => row.scheduledAt ?? '',
    cell: (campaign) => <span>{campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : 'On demand'}</span>,
  },
  {
    id: 'latestJob',
    header: 'Latest job',
    accessor: (row) => row.latestJob?.status ?? '',
    cell: (campaign) => (
      <div className="text-sm text-slate-600">
        {campaign.latestJob ? `${campaign.latestJob.status} • ${campaign.latestJob.processedRecords}/${campaign.latestJob.totalRecords}` : 'No job yet'}
      </div>
    ),
  },
  {
    id: 'updated',
    header: 'Updated',
    accessor: (row) => row.updatedAt,
    cell: (campaign) => formatDateTime(campaign.updatedAt),
  },
];

export default function CampaignsPage(): React.ReactElement {
  const appliedDefaultRef = useRef(false);
  const { filters, updateFilters, applyFilters, queryString } = useUrlFilters(DEFAULT_FILTERS);
  const campaigns = useCampaignsQuery();
  const savedViews = useSavedViews('campaigns');

  useEffect(() => {
    if (!appliedDefaultRef.current && !queryString && savedViews.defaultView) {
      appliedDefaultRef.current = true;
      applyFilters({ ...DEFAULT_FILTERS, ...savedViews.defaultView.filters });
    }
  }, [applyFilters, queryString, savedViews.defaultView]);

  const filteredCampaigns = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (campaigns.data ?? []).filter((campaign) => {
      if (filters.status && campaign.status !== filters.status) {
        return false;
      }
      if (!search) {
        return true;
      }
      return campaign.name.toLowerCase().includes(search) || String(campaign.id) === search;
    });
  }, [campaigns.data, filters.search, filters.status]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const pagedCampaigns = filteredCampaigns.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campaigns"
        title="Scheduled and historical campaigns"
        description="Track campaign status, the latest job progress, and jump into schedule detail or job state as needed."
        actions={(
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={filteredCampaigns.length === 0}
              onClick={() => {
                downloadCsv({
                  filename: 'campaigns.csv',
                  columns: [
                    { header: 'Campaign ID', value: (row) => row.id },
                    { header: 'Name', value: (row) => row.name },
                    { header: 'Status', value: (row) => row.status },
                    { header: 'Source Type', value: (row) => row.sourceType },
                    { header: 'Scheduled At', value: (row) => row.scheduledAt ?? '' },
                    { header: 'Updated At', value: (row) => row.updatedAt },
                  ],
                  rows: filteredCampaigns as unknown as Record<string, unknown>[],
                });
                toast.success('Campaign export downloaded.');
              }}
            >
              Export CSV
            </Button>
            <Link href="/campaigns/schedules" className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white">View schedules</Link>
          </div>
        )}
      />

      <SavedViewsManager
        views={savedViews.views}
        onSave={(name, setDefault) => savedViews.saveView(name, filters, setDefault)}
        onLoad={(id) => {
          const view = savedViews.views.find((entry) => entry.id === id);
          if (view) {
            applyFilters({ ...DEFAULT_FILTERS, ...view.filters });
          }
        }}
        onDelete={(id) => savedViews.removeView(id)}
        onSetDefault={(id) => savedViews.setDefaultView(id)}
      />

      <AppCard className="grid gap-4 md:grid-cols-3">
        <Field label="Search">
          <Input value={filters.search} placeholder="Campaign name or ID" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
        </Field>
        <Field label="Status">
          <Select value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value, page: '1' })}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
      </AppCard>

      <DataGrid
        columns={COLUMNS}
        data={pagedCampaigns}
        getRowId={(row) => row.id}
        emptyMessage="No campaigns matched the current filters."
        loading={campaigns.isLoading}
        error={campaigns.isError ? <ErrorPanel title="Campaigns unavailable" error={campaigns.error} onRetry={() => campaigns.refetch()} /> : undefined}
        pagination={{
          page,
          pageSize,
          total: filteredCampaigns.length,
          onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
          onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
        }}
        visibilityStorageKey="campaigns-grid-columns"
      />
    </div>
  );
}
