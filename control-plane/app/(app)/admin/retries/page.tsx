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
import { RoleGuard } from '@/components/role-guard';
import { AppCard, Field, InlineLoader, Input, PageHeader, Select, Textarea, StatusBadge } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { RetryPolicyItem } from '@/lib/api-types';
import { useProvidersQuery, useRetryPoliciesQuery } from '@/lib/hooks';
import { useUrlFilters } from '@/lib/use-url-filters';
import { formatDateTime } from '@/lib/utils';

const schema = z.object({
  providerId: z.coerce.number().optional(),
  trafficType: z.enum(['transactional', 'otp', 'marketing']).default('transactional'),
  maxAttempts: z.coerce.number().min(1),
  retryIntervalsText: z.string().min(1),
  retryOnErrorsText: z.string().min(1),
  isActive: z.enum(['true', 'false']).default('true'),
});

const DEFAULT_FILTERS = {
  search: '',
  trafficType: '',
  providerId: '',
  page: '1',
  limit: '10',
};

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export default function RetryPoliciesPage(): React.ReactElement {
  const policies = useRetryPoliciesQuery();
  const providers = useProvidersQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      trafficType: 'transactional',
      maxAttempts: 3,
      retryIntervalsText: '5,30,300',
      retryOnErrorsText: 'timeout,throttle,http_provider_error',
      isActive: 'true',
    },
  });

  const providerNameById = useMemo(
    () => new Map((providers.data ?? []).map((provider) => [provider.id, provider.name])),
    [providers.data],
  );

  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (policies.data ?? []).filter((policy) => {
      if (filters.trafficType && policy.trafficType !== filters.trafficType) {
        return false;
      }
      if (filters.providerId && String(policy.providerId ?? '') !== filters.providerId) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        String(policy.id) === search
        || String(policy.providerId ?? '').includes(search)
        || (policy.trafficType ?? '').toLowerCase().includes(search)
        || policy.retryOnErrors.join(' ').toLowerCase().includes(search)
      );
    });
  }, [filters.providerId, filters.search, filters.trafficType, policies.data]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataGridColumn<RetryPolicyItem>[] = [
    {
      id: 'policy',
      header: 'Policy',
      accessor: (row) => row.id,
      cell: (policy) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">#{policy.id}</span>
            <CopyButton value={String(policy.id)} label="Copy retry policy ID" />
          </div>
          <p className="text-xs text-slate-500">{policy.providerId ? (providerNameById.get(policy.providerId) ?? `Provider #${policy.providerId}`) : 'Tenant default'}</p>
        </div>
      ),
    },
    {
      id: 'traffic',
      header: 'Traffic',
      accessor: (row) => row.trafficType ?? '',
      cell: (policy) => policy.trafficType ?? 'All traffic',
    },
    {
      id: 'attempts',
      header: 'Attempts',
      accessor: (row) => row.maxAttempts,
      cell: (policy) => String(policy.maxAttempts),
    },
    {
      id: 'intervals',
      header: 'Intervals',
      accessor: (row) => row.retryIntervals.join(','),
      cell: (policy) => policy.retryIntervals.join(', '),
    },
    {
      id: 'errors',
      header: 'Retryable errors',
      accessor: (row) => row.retryOnErrors.join(','),
      cell: (policy) => policy.retryOnErrors.join(', '),
    },
    {
      id: 'updated',
      header: 'Updated',
      accessor: (row) => row.updatedAt,
      cell: (policy) => formatDateTime(policy.updatedAt),
    },
    {
      id: 'active',
      header: 'Active',
      accessor: (row) => row.isActive ? 1 : 0,
      cell: (policy) => <StatusBadge value={policy.isActive ? 'active' : 'inactive'} />,
    },
  ];

  if (policies.isLoading || providers.isLoading) {
    return <InlineLoader label="Loading retry policies" />;
  }

  if (policies.isError || providers.isError || !policies.data) {
    return <ErrorPanel title="Retry policies unavailable" error={policies.error ?? providers.error} onRetry={async () => {
      await Promise.all([policies.refetch(), providers.refetch()]);
    }} />;
  }

  return (
    <RoleGuard allowedRoles={['admin', 'support']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Admin" title="Retry policies" description="Keep retry rules data-driven and reviewable, with explicit confirmation before changing dispatch retry behavior." />

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <AppCard className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Create retry policy</h2>
            <form className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Provider">
                  <Select {...form.register('providerId', { valueAsNumber: true })}>
                    <option value="">Tenant default</option>
                    {providers.data?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                  </Select>
                </Field>
                <Field label="Traffic type">
                  <Select {...form.register('trafficType')}>
                    <option value="transactional">Transactional</option>
                    <option value="otp">OTP</option>
                    <option value="marketing">Marketing</option>
                  </Select>
                </Field>
                <Field label="Max attempts">
                  <Input type="number" {...form.register('maxAttempts', { valueAsNumber: true })} />
                </Field>
                <Field label="Active">
                  <Select {...form.register('isActive')}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </Field>
              </div>
              <Field label="Retry intervals (seconds)">
                <Textarea rows={3} {...form.register('retryIntervalsText')} />
              </Field>
              <Field label="Retryable errors">
                <Textarea rows={3} {...form.register('retryOnErrorsText')} />
              </Field>
              <ConfirmButton
                variant="primary"
                title="Create retry policy"
                confirmText="Retry policy changes alter dispatch retry timing, failure handling, and carrier pressure behavior."
                confirmLabel="Save retry policy"
                requireReauth
                beforeOpen={() => form.trigger()}
                onConfirm={async ({ reauthToken } = {}) => {
                  await form.handleSubmit(async (values) => {
                    await apiRequest('/routing/retry-policies', {
                      method: 'POST',
                      headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
                      body: JSON.stringify({
                        providerId: values.providerId || undefined,
                        trafficType: values.trafficType,
                        maxAttempts: values.maxAttempts,
                        retryIntervals: values.retryIntervalsText.split(',').map((item) => Number(item.trim())).filter(Number.isFinite),
                        retryOnErrors: values.retryOnErrorsText.split(',').map((item) => item.trim()).filter(Boolean),
                        isActive: values.isActive === 'true',
                      }),
                    });
                    toast.success('Retry policy saved.');
                    form.reset({
                      trafficType: 'transactional',
                      maxAttempts: 3,
                      retryIntervalsText: '5,30,300',
                      retryOnErrorsText: 'timeout,throttle,http_provider_error',
                      isActive: 'true',
                    });
                    await policies.refetch();
                  })();
                }}
              >
                Save policy
              </ConfirmButton>
            </form>
          </AppCard>

          <div className="space-y-4">
            <AppCard className="grid gap-4 md:grid-cols-3">
              <Field label="Search">
                <Input value={filters.search} placeholder="Policy ID, provider, error token" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
              </Field>
              <Field label="Traffic type">
                <Select value={filters.trafficType} onChange={(event) => applyFilters({ ...filters, trafficType: event.target.value, page: '1' })}>
                  <option value="">All traffic</option>
                  <option value="transactional">Transactional</option>
                  <option value="otp">OTP</option>
                  <option value="marketing">Marketing</option>
                </Select>
              </Field>
              <Field label="Provider">
                <Select value={filters.providerId} onChange={(event) => applyFilters({ ...filters, providerId: event.target.value, page: '1' })}>
                  <option value="">All providers</option>
                  {providers.data?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                </Select>
              </Field>
            </AppCard>

            <DataGrid
              columns={columns}
              data={rows}
              getRowId={(row) => row.id}
              emptyMessage="No retry policies matched the current filters."
              pagination={{
                page,
                pageSize,
                total: filteredRows.length,
                onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
                onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
              }}
              visibilityStorageKey="retry-policies-grid-columns"
            />
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
