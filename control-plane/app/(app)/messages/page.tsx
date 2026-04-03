'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { SavedViewsManager } from '@/components/ui/saved-views-manager';
import { AppCard, Button, Field, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { downloadCsv } from '@/lib/csv';
import { useMessagesQuery } from '@/lib/hooks';
import { useSavedViews } from '@/lib/saved-views';
import { useUrlFilters } from '@/lib/use-url-filters';
import { MessageItem } from '@/lib/api-types';
import { formatDateTime, formatMinorUnits } from '@/lib/utils';

const DEFAULT_FILTERS = {
  status: '',
  phoneNumber: '',
  providerMessageId: '',
  senderId: '',
  providerId: '',
  campaignId: '',
  from: '',
  to: '',
  page: '1',
  limit: '25',
};

const COLUMNS: DataGridColumn<MessageItem>[] = [
  {
    id: 'message',
    header: 'Message',
    accessor: (row) => row.id,
    cell: (message) => (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Link href={`/messages/${message.submitDate}/${message.tenantId}/${message.id}`} className="font-semibold text-slate-950 hover:text-teal-700">
            #{message.id}
          </Link>
          <CopyButton value={`${message.submitDate}/${message.tenantId}/${message.id}`} label="Copy message composite ID" />
        </div>
        <p className="line-clamp-2 max-w-sm text-xs text-slate-500">{message.body}</p>
      </div>
    ),
  },
  {
    id: 'destination',
    header: 'Destination',
    accessor: (row) => row.phoneNumber,
    cell: (message) => (
      <div>
        <p className="font-medium text-slate-900">{message.phoneNumber}</p>
        <p className="text-xs text-slate-500">{message.clientMessageId ?? 'No client ID'}</p>
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessor: (row) => row.status,
    cell: (message) => <StatusBadge value={message.status} />,
  },
  {
    id: 'provider',
    header: 'Provider',
    accessor: (row) => row.providerId ?? 0,
    cell: (message) => (
      <div className="space-y-1">
        <p className="font-medium text-slate-900">{message.providerId ?? 'Pending route'}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{message.providerMessageId ?? 'No provider reference yet'}</span>
          {message.providerMessageId ? <CopyButton value={message.providerMessageId} label="Copy provider message ID" /> : null}
        </div>
      </div>
    ),
  },
  {
    id: 'billing',
    header: 'Billing',
    accessor: (row) => row.priceMinor,
    cell: (message) => (
      <div className="space-y-1">
        <p className="font-medium text-slate-900">{formatMinorUnits(message.priceMinor)}</p>
        <p className="text-xs text-slate-500">{message.billingState}</p>
      </div>
    ),
  },
  {
    id: 'accepted',
    header: 'Accepted',
    accessor: (row) => row.acceptedAt,
    cell: (message) => <span>{formatDateTime(message.acceptedAt)}</span>,
  },
];

export default function MessagesPage(): React.ReactElement {
  const appliedDefaultRef = useRef(false);
  const { filters, updateFilters, applyFilters, resetFilters, queryString } = useUrlFilters(DEFAULT_FILTERS);
  const messages = useMessagesQuery(queryString);
  const savedViews = useSavedViews('messages');

  useEffect(() => {
    if (!appliedDefaultRef.current && !queryString && savedViews.defaultView) {
      appliedDefaultRef.current = true;
      applyFilters({ ...DEFAULT_FILTERS, ...savedViews.defaultView.filters });
    }
  }, [applyFilters, queryString, savedViews.defaultView]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Messages explorer"
        title="Trace live and historical traffic"
        description="Filter tenant traffic by status, destination, sender, provider, campaign, or correlation ID, then drill into the full lifecycle trace."
        actions={(
          <Button
            type="button"
            variant="ghost"
            disabled={!messages.data?.items.length}
            onClick={() => {
              if (!messages.data?.items.length) {
                return;
              }
              downloadCsv({
                filename: 'messages-export.csv',
                columns: [
                  { header: 'Message ID', value: (row) => row.id },
                  { header: 'Submit Date', value: (row) => row.submitDate },
                  { header: 'Tenant ID', value: (row) => row.tenantId },
                  { header: 'Phone Number', value: (row) => row.phoneNumber },
                  { header: 'Status', value: (row) => row.status },
                  { header: 'Provider Message ID', value: (row) => row.providerMessageId ?? '' },
                  { header: 'Billing State', value: (row) => row.billingState },
                  { header: 'Price Minor', value: (row) => row.priceMinor },
                  { header: 'Accepted At', value: (row) => row.acceptedAt },
                ],
                rows: messages.data.items as unknown as Record<string, unknown>[],
              });
              toast.success('Message export downloaded.');
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
          toast.success('Saved view updated.');
        }}
        onLoad={(id) => {
          const view = savedViews.views.find((entry) => entry.id === id);
          if (!view) {
            return;
          }
          applyFilters({ ...DEFAULT_FILTERS, ...view.filters });
          toast.success(`Loaded ${view.name}.`);
        }}
        onDelete={(id) => {
          savedViews.removeView(id);
          toast.success('Saved view removed.');
        }}
        onSetDefault={(id) => {
          savedViews.setDefaultView(id);
          toast.success(id ? 'Default view updated.' : 'Default view cleared.');
        }}
      />

      <AppCard className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Status">
            <Select
              value={filters.status}
              onChange={(event) => applyFilters({ ...filters, status: event.target.value, page: '1' })}
            >
              <option value="">All statuses</option>
              <option value="accepted">Accepted</option>
              <option value="routed">Routed</option>
              <option value="submitting">Submitting</option>
              <option value="provider_accepted">Provider accepted</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </Select>
          </Field>
          <Field label="Phone number">
            <Input
              placeholder="+251911234567"
              value={filters.phoneNumber}
              onChange={(event) => updateFilters({ phoneNumber: event.target.value })}
              onBlur={() => applyFilters({ ...filters, page: '1' })}
            />
          </Field>
          <Field label="Provider message ID">
            <Input
              placeholder="provider-ref"
              value={filters.providerMessageId}
              onChange={(event) => updateFilters({ providerMessageId: event.target.value })}
              onBlur={() => applyFilters({ ...filters, page: '1' })}
            />
          </Field>
          <Field label="Campaign ID">
            <Input
              placeholder="42"
              value={filters.campaignId}
              onChange={(event) => updateFilters({ campaignId: event.target.value })}
              onBlur={() => applyFilters({ ...filters, page: '1' })}
            />
          </Field>
          <Field label="Provider ID">
            <Input
              placeholder="1"
              value={filters.providerId}
              onChange={(event) => updateFilters({ providerId: event.target.value })}
              onBlur={() => applyFilters({ ...filters, page: '1' })}
            />
          </Field>
          <Field label="Sender ID">
            <Input
              placeholder="MYAPP"
              value={filters.senderId}
              onChange={(event) => updateFilters({ senderId: event.target.value })}
              onBlur={() => applyFilters({ ...filters, page: '1' })}
            />
          </Field>
          <Field label="From">
            <Input
              type="datetime-local"
              value={filters.from}
              onChange={(event) => updateFilters({ from: event.target.value })}
              onBlur={() => applyFilters({ ...filters, page: '1' })}
            />
          </Field>
          <Field label="To">
            <Input
              type="datetime-local"
              value={filters.to}
              onChange={(event) => updateFilters({ to: event.target.value })}
              onBlur={() => applyFilters({ ...filters, page: '1' })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="ghost" onClick={resetFilters}>Reset filters</Button>
        </div>
      </AppCard>

      <DataGrid
        columns={COLUMNS}
        data={messages.data?.items ?? []}
        getRowId={(row) => `${row.submitDate}-${row.tenantId}-${row.id}`}
        emptyMessage="No messages matched the current filters."
        loading={messages.isLoading}
        error={messages.isError ? <ErrorPanel title="Messages unavailable" error={messages.error} onRetry={() => messages.refetch()} /> : undefined}
        pagination={messages.data ? {
          page: messages.data.pagination.page,
          pageSize: messages.data.pagination.limit,
          total: messages.data.pagination.total,
          onPageChange: (page) => applyFilters({ ...filters, page: String(page) }),
          onPageSizeChange: (pageSize) => applyFilters({ ...filters, limit: String(pageSize), page: '1' }),
        } : undefined}
        visibilityStorageKey="messages-grid-columns"
      />
    </div>
  );
}
