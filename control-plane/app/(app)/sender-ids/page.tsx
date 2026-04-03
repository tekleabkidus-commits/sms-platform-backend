'use client';

import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { AppCard, Button, Field, InlineLoader, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { useProvidersQuery, useSenderIdsQuery } from '@/lib/hooks';
import { useSessionData } from '@/lib/session-context';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { useUrlFilters } from '@/lib/use-url-filters';
import { SenderIdItem } from '@/lib/api-types';
import { formatDateTime } from '@/lib/utils';

const schema = z.object({
  senderName: z.string().min(2).max(20),
  providerId: z.coerce.number().min(1),
});

const DEFAULT_FILTERS = {
  search: '',
  status: '',
  page: '1',
  limit: '10',
};

export default function SenderIdsPage(): React.ReactElement {
  const session = useSessionData();
  const senderIds = useSenderIdsQuery();
  const providers = useProvidersQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const form = useForm({
    resolver: zodResolver(schema),
  });

  useUnsavedChanges(form.formState.isDirty);

  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (senderIds.data ?? []).filter((sender) => {
      if (filters.status && sender.status !== filters.status) {
        return false;
      }
      if (!search) {
        return true;
      }
      return sender.senderName.toLowerCase().includes(search) || String(sender.id) === search;
    });
  }, [filters.search, filters.status, senderIds.data]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataGridColumn<SenderIdItem>[] = [
    {
      id: 'sender',
      header: 'Sender ID',
      accessor: (row) => row.senderName,
      cell: (sender) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{sender.senderName}</span>
            <CopyButton value={sender.senderName} label="Copy sender ID" />
          </div>
          <p className="text-xs text-slate-500">#{sender.id}</p>
        </div>
      ),
    },
    {
      id: 'provider',
      header: 'Provider',
      accessor: (row) => row.providerId,
      cell: (sender) => `Provider #${sender.providerId}`,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      cell: (sender) => <StatusBadge value={sender.status} />,
    },
    {
      id: 'reason',
      header: 'Reason',
      accessor: (row) => row.rejectionReason ?? row.approvedAt ?? '',
      cell: (sender) => sender.rejectionReason ?? (sender.approvedAt ? `Approved ${formatDateTime(sender.approvedAt)}` : '—'),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (sender) => session.user.role === 'admin' || session.user.role === 'support'
        ? (
          <div className="flex flex-wrap gap-2">
            <ConfirmButton
              variant="secondary"
              title={`Approve ${sender.senderName}`}
              confirmText={`Approve sender ${sender.senderName} for provider ${sender.providerId}?`}
              requireReauth
              confirmLabel="Approve sender"
              onConfirm={async ({ reauthToken } = {}) => {
                await apiRequest(`/sender-ids/${sender.id}/approve`, {
                  method: 'POST',
                  headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
                });
                toast.success('Sender ID approved.');
                await senderIds.refetch();
              }}
            >
              Approve
            </ConfirmButton>
            <ConfirmButton
              variant="danger"
              title={`Reject ${sender.senderName}`}
              confirmText={`Reject sender ${sender.senderName}. This can block live campaigns that depend on it.`}
              requireText={sender.senderName}
              requireReauth
              confirmLabel="Reject sender"
              onConfirm={async ({ reauthToken } = {}) => {
                await apiRequest(`/sender-ids/${sender.id}/reject`, {
                  method: 'POST',
                  headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
                  body: JSON.stringify({ reason: 'Rejected in control plane review' }),
                });
                toast.success('Sender ID rejected.');
                await senderIds.refetch();
              }}
            >
              Reject
            </ConfirmButton>
          </div>
        )
        : 'Review restricted',
    },
  ];

  if (senderIds.isLoading || providers.isLoading) {
    return <InlineLoader label="Loading sender IDs" />;
  }

  if (senderIds.isError || !senderIds.data) {
    return <ErrorPanel title="Sender IDs unavailable" error={senderIds.error} onRetry={() => senderIds.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sender IDs"
        title="Compliance and approval workflow"
        description="Request sender IDs for carriers, and approve or reject them when your role is authorized to do so."
      />

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Request sender ID</h2>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await apiRequest('/sender-ids', {
                  method: 'POST',
                  body: JSON.stringify(values),
                });
                toast.success('Sender ID request submitted.');
                form.reset();
                await senderIds.refetch();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Unable to request sender ID');
              }
            })}
          >
            <Field label="Sender name" error={form.formState.errors.senderName?.message}>
              <Input placeholder="MYAPP" {...form.register('senderName')} />
            </Field>
            <Field label="Provider" error={form.formState.errors.providerId?.message}>
              <Select {...form.register('providerId', { valueAsNumber: true })}>
                <option value="">Select provider</option>
                {providers.data?.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={form.formState.isSubmitting}>Submit request</Button>
          </form>
        </AppCard>

        <div className="space-y-4">
          <AppCard className="grid gap-4 md:grid-cols-2">
            <Field label="Search">
              <Input value={filters.search} placeholder="Sender name or ID" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
            </Field>
            <Field label="Status">
              <Select value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value, page: '1' })}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </Select>
            </Field>
          </AppCard>

          <DataGrid
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            emptyMessage="No sender IDs matched the current filters."
            pagination={{
              page,
              pageSize,
              total: filteredRows.length,
              onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
              onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
            }}
            visibilityStorageKey="sender-ids-grid-columns"
          />
        </div>
      </div>
    </div>
  );
}
