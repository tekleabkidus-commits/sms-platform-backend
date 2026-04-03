'use client';

import Link from 'next/link';
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
import { AppCard, Field, InlineLoader, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { RoutingRuleItem } from '@/lib/api-types';
import { useProvidersQuery, useRoutingRulesQuery } from '@/lib/hooks';
import { useUrlFilters } from '@/lib/use-url-filters';
import { formatDateTime } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(3),
  providerId: z.coerce.number().min(1),
  countryCode: z.string().max(8).optional(),
  trafficType: z.enum(['transactional', 'otp', 'marketing']).default('transactional'),
  preferredProtocol: z.enum(['http', 'smpp']).optional(),
  priority: z.coerce.number().default(100),
  weight: z.coerce.number().default(100),
  costRank: z.coerce.number().default(100),
  failoverOrder: z.coerce.number().default(1),
  maxTps: z.coerce.number().optional(),
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

export default function RoutingAdminPage(): React.ReactElement {
  const routingRules = useRoutingRulesQuery();
  const providers = useProvidersQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      trafficType: 'transactional',
      priority: 100,
      weight: 100,
      costRank: 100,
      failoverOrder: 1,
      isActive: 'true',
    },
  });

  const providerNameById = useMemo(
    () => new Map((providers.data ?? []).map((provider) => [provider.id, provider.name])),
    [providers.data],
  );

  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (routingRules.data ?? []).filter((rule) => {
      if (filters.trafficType && rule.trafficType !== filters.trafficType) {
        return false;
      }
      if (filters.providerId && String(rule.providerId) !== filters.providerId) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        rule.name.toLowerCase().includes(search)
        || String(rule.id) === search
        || String(rule.providerId) === search
        || (rule.countryCode ?? '').toLowerCase().includes(search)
      );
    });
  }, [filters.providerId, filters.search, filters.trafficType, routingRules.data]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataGridColumn<RoutingRuleItem>[] = [
    {
      id: 'rule',
      header: 'Rule',
      accessor: (row) => row.name,
      cell: (rule) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{rule.name}</span>
            <CopyButton value={String(rule.id)} label="Copy routing rule ID" />
          </div>
          <p className="text-xs text-slate-500">Rule #{rule.id}</p>
        </div>
      ),
    },
    {
      id: 'provider',
      header: 'Provider',
      accessor: (row) => providerNameById.get(row.providerId) ?? row.providerId,
      cell: (rule) => (
        <Link href={`/admin/providers/${rule.providerId}`} className="text-teal-700 hover:text-teal-600">
          {providerNameById.get(rule.providerId) ?? `Provider #${rule.providerId}`}
        </Link>
      ),
    },
    {
      id: 'scope',
      header: 'Scope',
      accessor: (row) => `${row.countryCode ?? 'all'}:${row.trafficType}`,
      cell: (rule) => `${rule.countryCode ?? 'All destinations'} • ${rule.trafficType}`,
    },
    {
      id: 'protocol',
      header: 'Protocol',
      accessor: (row) => row.preferredProtocol ?? '',
      cell: (rule) => rule.preferredProtocol ?? 'Auto',
    },
    {
      id: 'priority',
      header: 'Priority / weight',
      accessor: (row) => `${row.priority}:${row.weight}`,
      cell: (rule) => `${rule.priority} • ${rule.weight}`,
    },
    {
      id: 'failover',
      header: 'Failover',
      accessor: (row) => `${row.failoverOrder}:${row.costRank}`,
      cell: (rule) => `Order ${rule.failoverOrder} • Cost rank ${rule.costRank}`,
    },
    {
      id: 'updated',
      header: 'Updated',
      accessor: (row) => row.updatedAt,
      cell: (rule) => formatDateTime(rule.updatedAt),
    },
    {
      id: 'active',
      header: 'Active',
      accessor: (row) => row.isActive ? 1 : 0,
      cell: (rule) => <StatusBadge value={rule.isActive ? 'active' : 'inactive'} />,
    },
  ];

  if (routingRules.isLoading || providers.isLoading) {
    return <InlineLoader label="Loading routing rules" />;
  }

  if (routingRules.isError || providers.isError || !routingRules.data) {
    return <ErrorPanel title="Routing rules unavailable" error={routingRules.error ?? providers.error} onRetry={async () => {
      await Promise.all([routingRules.refetch(), providers.refetch()]);
    }} />;
  }

  return (
    <RoleGuard allowedRoles={['admin', 'support']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Admin" title="Routing rules" description="Manage route priority, weight, failover order, and provider preference with explicit confirmation and password re-checks." />

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <AppCard className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Create routing rule</h2>
            <form className="space-y-4">
              <Field label="Rule name" error={form.formState.errors.name?.message}>
                <Input {...form.register('name')} />
              </Field>
              <Field label="Provider" error={form.formState.errors.providerId?.message}>
                <Select {...form.register('providerId', { valueAsNumber: true })}>
                  <option value="">Select provider</option>
                  {providers.data?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                </Select>
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Country code">
                  <Input placeholder="ET" {...form.register('countryCode')} />
                </Field>
                <Field label="Traffic type">
                  <Select {...form.register('trafficType')}>
                    <option value="transactional">Transactional</option>
                    <option value="otp">OTP</option>
                    <option value="marketing">Marketing</option>
                  </Select>
                </Field>
                <Field label="Preferred protocol">
                  <Select {...form.register('preferredProtocol')}>
                    <option value="">Auto</option>
                    <option value="http">HTTP</option>
                    <option value="smpp">SMPP</option>
                  </Select>
                </Field>
                <Field label="Max TPS">
                  <Input type="number" {...form.register('maxTps', { valueAsNumber: true })} />
                </Field>
                <Field label="Priority">
                  <Input type="number" {...form.register('priority', { valueAsNumber: true })} />
                </Field>
                <Field label="Weight">
                  <Input type="number" {...form.register('weight', { valueAsNumber: true })} />
                </Field>
                <Field label="Cost rank">
                  <Input type="number" {...form.register('costRank', { valueAsNumber: true })} />
                </Field>
                <Field label="Failover order">
                  <Input type="number" {...form.register('failoverOrder', { valueAsNumber: true })} />
                </Field>
              </div>
              <Field label="Active">
                <Select {...form.register('isActive')}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </Field>
              <ConfirmButton
                variant="primary"
                title="Create routing rule"
                confirmText="Routing rule changes affect live provider selection and failover behavior."
                confirmLabel="Save routing rule"
                requireReauth
                beforeOpen={() => form.trigger()}
                onConfirm={async ({ reauthToken } = {}) => {
                  await form.handleSubmit(async (values) => {
                    await apiRequest('/routing/rules', {
                      method: 'POST',
                      headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
                      body: JSON.stringify({
                        ...values,
                        countryCode: values.countryCode || undefined,
                        preferredProtocol: values.preferredProtocol || undefined,
                        maxTps: values.maxTps || undefined,
                        isActive: values.isActive === 'true',
                      }),
                    });
                    toast.success('Routing rule saved.');
                    form.reset({
                      trafficType: 'transactional',
                      priority: 100,
                      weight: 100,
                      costRank: 100,
                      failoverOrder: 1,
                      isActive: 'true',
                    });
                    await routingRules.refetch();
                  })();
                }}
              >
                Save rule
              </ConfirmButton>
            </form>
          </AppCard>

          <div className="space-y-4">
            <AppCard className="grid gap-4 md:grid-cols-3">
              <Field label="Search">
                <Input value={filters.search} placeholder="Rule name, ID, provider, country" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
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
              emptyMessage="No routing rules matched the current filters."
              pagination={{
                page,
                pageSize,
                total: filteredRows.length,
                onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
                onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
              }}
              visibilityStorageKey="routing-rules-grid-columns"
            />
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
