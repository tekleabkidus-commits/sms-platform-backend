'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { SavedViewsManager } from '@/components/ui/saved-views-manager';
import { AppCard, Button, Field, Input, MetricCard, PageHeader, Select } from '@/components/ui/primitives';
import { downloadCsv } from '@/lib/csv';
import { useSavedViews } from '@/lib/saved-views';
import { useUrlFilters } from '@/lib/use-url-filters';
import { useWalletQuery, useWalletTransactionsQuery } from '@/lib/hooks';
import { WalletTransactionItem } from '@/lib/api-types';
import { formatDateTime, formatMinorUnits } from '@/lib/utils';

const DEFAULT_FILTERS = {
  kind: '',
  messageId: '',
  campaignId: '',
  providerId: '',
  from: '',
  to: '',
  page: '1',
  limit: '25',
};

const COLUMNS: DataGridColumn<WalletTransactionItem>[] = [
  {
    id: 'kind',
    header: 'Kind',
    accessor: (row) => row.kind,
    cell: (row) => row.kind,
  },
  {
    id: 'amount',
    header: 'Amount',
    accessor: (row) => row.amountMinor,
    cell: (row) => formatMinorUnits(row.amountMinor, row.currency),
  },
  {
    id: 'before',
    header: 'Before',
    accessor: (row) => row.balanceBeforeMinor,
    cell: (row) => formatMinorUnits(row.balanceBeforeMinor, row.currency),
  },
  {
    id: 'after',
    header: 'After',
    accessor: (row) => row.balanceAfterMinor,
    cell: (row) => formatMinorUnits(row.balanceAfterMinor, row.currency),
  },
  {
    id: 'message',
    header: 'Message / idempotency',
    accessor: (row) => row.messageId ?? row.idempotencyKey,
    cell: (row) => (
      <div className="space-y-1">
        <p>{row.messageId ? `#${row.messageId}` : '—'}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{row.idempotencyKey}</span>
          <CopyButton value={row.idempotencyKey} label="Copy billing idempotency key" />
        </div>
      </div>
    ),
  },
  {
    id: 'created',
    header: 'Created',
    accessor: (row) => row.createdAt,
    cell: (row) => formatDateTime(row.createdAt),
  },
];

export default function WalletPage(): React.ReactElement {
  const appliedDefaultRef = useRef(false);
  const wallet = useWalletQuery();
  const { filters, updateFilters, applyFilters, queryString } = useUrlFilters(DEFAULT_FILTERS);
  const transactions = useWalletTransactionsQuery(queryString);
  const savedViews = useSavedViews('wallet');

  useEffect(() => {
    if (!appliedDefaultRef.current && !queryString && savedViews.defaultView) {
      appliedDefaultRef.current = true;
      applyFilters({ ...DEFAULT_FILTERS, ...savedViews.defaultView.filters });
    }
  }, [applyFilters, queryString, savedViews.defaultView]);

  const exportRows = transactions.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Wallet & billing"
        title="Balances, reserves, and ledger events"
        description="Review the current wallet position and the transaction history tied to message reservations, debits, releases, and refunds."
        actions={(
          <Button
            type="button"
            variant="ghost"
            disabled={exportRows.length === 0}
            onClick={() => {
              downloadCsv({
                filename: 'wallet-ledger.csv',
                columns: [
                  { header: 'Ledger Date', value: (row) => row.ledgerDate },
                  { header: 'Kind', value: (row) => row.kind },
                  { header: 'Amount Minor', value: (row) => row.amountMinor },
                  { header: 'Currency', value: (row) => row.currency },
                  { header: 'Message ID', value: (row) => row.messageId ?? '' },
                  { header: 'Campaign ID', value: (row) => row.campaignId ?? '' },
                  { header: 'Provider ID', value: (row) => row.providerId ?? '' },
                  { header: 'Idempotency Key', value: (row) => row.idempotencyKey },
                  { header: 'Created At', value: (row) => row.createdAt },
                ],
                rows: exportRows as unknown as Record<string, unknown>[],
              });
              toast.success('Wallet ledger export downloaded.');
            }}
          >
            Export CSV
          </Button>
        )}
      />

      {wallet.isError ? <ErrorPanel title="Wallet unavailable" error={wallet.error} onRetry={() => wallet.refetch()} /> : null}
      {wallet.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Available" value={formatMinorUnits(wallet.data.availableBalanceMinor, wallet.data.currency)} />
          <MetricCard label="Reserved" value={formatMinorUnits(wallet.data.reservedBalanceMinor, wallet.data.currency)} />
          <MetricCard label="Reserved today" value={formatMinorUnits(wallet.data.recentTotals.reservedTodayMinor, wallet.data.currency)} />
          <MetricCard label="Debited today" value={formatMinorUnits(wallet.data.recentTotals.debitedTodayMinor, wallet.data.currency)} />
        </div>
      ) : null}

      <SavedViewsManager
        views={savedViews.views}
        onSave={(name, setDefault) => {
          savedViews.saveView(name, filters, setDefault);
          toast.success('Saved wallet view updated.');
        }}
        onLoad={(id) => {
          const view = savedViews.views.find((entry) => entry.id === id);
          if (!view) {
            return;
          }
          applyFilters({ ...DEFAULT_FILTERS, ...view.filters });
        }}
        onDelete={(id) => savedViews.removeView(id)}
        onSetDefault={(id) => savedViews.setDefaultView(id)}
      />

      <AppCard className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Field label="Kind">
          <Select value={filters.kind} onChange={(event) => applyFilters({ ...filters, kind: event.target.value, page: '1' })}>
            <option value="">All kinds</option>
            <option value="reserve">Reserve</option>
            <option value="debit">Debit</option>
            <option value="release">Release</option>
            <option value="refund">Refund</option>
          </Select>
        </Field>
        <Field label="Message ID">
          <Input value={filters.messageId} onChange={(event) => updateFilters({ messageId: event.target.value })} onBlur={() => applyFilters({ ...filters, page: '1' })} />
        </Field>
        <Field label="Campaign ID">
          <Input value={filters.campaignId} onChange={(event) => updateFilters({ campaignId: event.target.value })} onBlur={() => applyFilters({ ...filters, page: '1' })} />
        </Field>
        <Field label="Provider ID">
          <Input value={filters.providerId} onChange={(event) => updateFilters({ providerId: event.target.value })} onBlur={() => applyFilters({ ...filters, page: '1' })} />
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
        data={transactions.data?.items ?? []}
        getRowId={(row) => `${row.ledgerDate}-${row.id}`}
        emptyMessage="No ledger rows matched the current filters."
        loading={wallet.isLoading || transactions.isLoading}
        error={transactions.isError ? <ErrorPanel title="Wallet ledger unavailable" error={transactions.error} onRetry={() => transactions.refetch()} /> : undefined}
        pagination={transactions.data ? {
          page: transactions.data.pagination.page,
          pageSize: transactions.data.pagination.limit,
          total: transactions.data.pagination.total,
          onPageChange: (page) => applyFilters({ ...filters, page: String(page) }),
          onPageSizeChange: (pageSize) => applyFilters({ ...filters, limit: String(pageSize), page: '1' }),
        } : undefined}
        visibilityStorageKey="wallet-grid-columns"
      />
    </div>
  );
}
