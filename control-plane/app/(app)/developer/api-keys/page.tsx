'use client';

import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { RoleGuard } from '@/components/role-guard';
import { AppCard, Field, InlineLoader, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { ApiKeyItem } from '@/lib/api-types';
import { useApiKeysQuery } from '@/lib/hooks';
import { useUrlFilters } from '@/lib/use-url-filters';
import { formatDateTime } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(3),
  scopesText: z.string().default('sms:send'),
  rateLimitRps: z.coerce.number().min(1).max(10000).optional(),
  dailyQuota: z.coerce.number().min(1).optional(),
});

const DEFAULT_FILTERS = {
  search: '',
  status: '',
  page: '1',
  limit: '10',
};

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export default function ApiKeysPage(): React.ReactElement {
  const apiKeys = useApiKeysQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const [revealedSecret, setRevealedSecret] = useState<{ label: string; apiKey: string } | null>(null);
  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      scopesText: 'sms:send',
    },
  });

  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (apiKeys.data ?? []).filter((apiKey) => {
      if (filters.status) {
        const active = filters.status === 'active';
        if (apiKey.isActive !== active) {
          return false;
        }
      }
      if (!search) {
        return true;
      }
      return (
        apiKey.name.toLowerCase().includes(search)
        || apiKey.keyPrefix.toLowerCase().includes(search)
        || apiKey.id.toLowerCase().includes(search)
      );
    });
  }, [apiKeys.data, filters.search, filters.status]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataGridColumn<ApiKeyItem>[] = [
    {
      id: 'key',
      header: 'Key',
      accessor: (row) => row.name,
      cell: (apiKey) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{apiKey.name}</span>
            <CopyButton value={apiKey.id} label="Copy API key ID" />
          </div>
          <p className="text-xs text-slate-500">{apiKey.keyPrefix}</p>
        </div>
      ),
    },
    {
      id: 'scopes',
      header: 'Scopes',
      accessor: (row) => row.scopes.join(','),
      cell: (apiKey) => apiKey.scopes.join(', '),
    },
    {
      id: 'quota',
      header: 'Quota',
      accessor: (row) => `${row.rateLimitRps ?? 0}:${row.dailyQuota ?? 0}`,
      cell: (apiKey) => `${apiKey.rateLimitRps ?? '—'} RPS • ${apiKey.dailyQuota ?? '—'} daily`,
    },
    {
      id: 'activity',
      header: 'Last activity',
      accessor: (row) => row.lastUsedAt ?? row.createdAt,
      cell: (apiKey) => (
        <div className="text-sm text-slate-600">
          <div>{formatDateTime(apiKey.lastUsedAt ?? apiKey.createdAt)}</div>
          <div className="text-xs text-slate-500">Created {formatDateTime(apiKey.createdAt)}</div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.isActive ? 1 : 0,
      cell: (apiKey) => apiKey.isActive ? 'Active' : 'Disabled',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (apiKey) => (
        <div className="flex flex-wrap gap-2">
          <ConfirmButton
            variant="secondary"
            title={`Rotate ${apiKey.name}`}
            confirmText="Rotating an API key disables the current secret and issues a one-time replacement."
            confirmLabel="Rotate key"
            requireReauth
            onConfirm={async ({ reauthToken } = {}) => {
              const rotated = await apiRequest<{ apiKey: string }>(`/api-keys/${apiKey.id}/rotate`, {
                method: 'POST',
                headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
                body: JSON.stringify({ name: `${apiKey.name} rotated`, scopes: apiKey.scopes }),
              });
              setRevealedSecret({ label: `${apiKey.name} rotated`, apiKey: rotated.apiKey });
              toast.success('Rotated key issued. Copy it now; it will not be shown again.');
              await apiKeys.refetch();
            }}
          >
            Rotate
          </ConfirmButton>
          <ConfirmButton
            variant="danger"
            title={`Revoke ${apiKey.name}`}
            confirmText="Revoking an API key immediately blocks further API traffic for that secret."
            confirmLabel="Revoke key"
            requireText={apiKey.keyPrefix}
            requireReauth
            onConfirm={async ({ reauthToken } = {}) => {
              await apiRequest(`/api-keys/${apiKey.id}`, {
                method: 'DELETE',
                headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
              });
              toast.success('API key disabled.');
              await apiKeys.refetch();
            }}
          >
            Revoke
          </ConfirmButton>
        </div>
      ),
    },
  ];

  if (apiKeys.isLoading) {
    return <InlineLoader label="Loading API keys" />;
  }

  if (apiKeys.isError || !apiKeys.data) {
    return <ErrorPanel title="API keys unavailable" error={apiKeys.error} onRetry={() => apiKeys.refetch()} />;
  }

  return (
    <RoleGuard allowedRoles={['owner', 'admin', 'developer']}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Developer portal"
          title="API key lifecycle"
          description="Create, rotate, and revoke tenant-scoped API keys without ever re-exposing a secret after issuance."
        />

        {revealedSecret ? (
          <AppCard className="space-y-3 border-teal-200 bg-teal-50/70">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">One-time reveal</p>
              <h2 className="text-lg font-semibold text-slate-950">{revealedSecret.label}</h2>
              <p className="text-sm text-slate-600">Copy this key now. The control plane will not display it again after you leave this page.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-teal-200 bg-white px-4 py-3">
              <code className="flex-1 break-all text-sm text-slate-900">{revealedSecret.apiKey}</code>
              <CopyButton value={revealedSecret.apiKey} label="Copy newly issued API key" />
            </div>
          </AppCard>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <AppCard className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Create key</h2>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                try {
                  const created = await apiRequest<{ apiKey: string }>('/api-keys', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: values.name,
                      scopes: values.scopesText.split(',').map((item: string) => item.trim()).filter(Boolean),
                      rateLimitRps: values.rateLimitRps || undefined,
                      dailyQuota: values.dailyQuota || undefined,
                    }),
                  });
                  setRevealedSecret({ label: values.name, apiKey: created.apiKey });
                  toast.success('API key created. Copy it now; it will not be shown again.');
                  form.reset({ scopesText: 'sms:send' });
                  await apiKeys.refetch();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Unable to create API key');
                }
              })}
            >
              <Field label="Name" error={form.formState.errors.name?.message}>
                <Input placeholder="Primary transactional key" {...form.register('name')} />
              </Field>
              <Field label="Scopes" hint="Comma-separated scopes">
                <Textarea rows={3} {...form.register('scopesText')} />
              </Field>
              <Field label="Rate limit (RPS)">
                <Input type="number" {...form.register('rateLimitRps', { valueAsNumber: true })} />
              </Field>
              <Field label="Daily quota">
                <Input type="number" {...form.register('dailyQuota', { valueAsNumber: true })} />
              </Field>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? 'Creating…' : 'Create key'}
              </button>
            </form>
          </AppCard>

          <div className="space-y-4">
            <AppCard className="grid gap-4 md:grid-cols-2">
              <Field label="Search">
                <Input value={filters.search} placeholder="Name, key prefix, or ID" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
              </Field>
              <Field label="Status">
                <Select value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value, page: '1' })}>
                  <option value="">All keys</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </Select>
              </Field>
            </AppCard>

            <DataGrid
              columns={columns}
              data={rows}
              getRowId={(row) => row.id}
              emptyMessage="No API keys matched the current filters."
              pagination={{
                page,
                pageSize,
                total: filteredRows.length,
                onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
                onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
              }}
              visibilityStorageKey="api-keys-grid-columns"
            />
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
