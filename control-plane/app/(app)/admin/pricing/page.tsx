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
import { AppCard, Field, InlineLoader, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { PricingRuleItem } from '@/lib/api-types';
import { usePricingRulesQuery, useProvidersQuery } from '@/lib/hooks';
import { useUrlFilters } from '@/lib/use-url-filters';
import { formatDateTime, formatMinorUnits } from '@/lib/utils';

const schema = z.object({
  kind: z.enum(['sell', 'cost']),
  providerId: z.coerce.number().optional(),
  countryCode: z.string().max(8).optional(),
  trafficType: z.enum(['transactional', 'otp', 'marketing']).default('transactional'),
  partsFrom: z.coerce.number().min(1).default(1),
  partsTo: z.coerce.number().min(1).default(1),
  unitPriceMinor: z.coerce.number().min(1),
  currency: z.string().min(3).max(3).default('ETB'),
  isActive: z.enum(['true', 'false']).default('true'),
});

const DEFAULT_FILTERS = {
  search: '',
  kind: '',
  providerId: '',
  page: '1',
  limit: '10',
};

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export default function PricingPage(): React.ReactElement {
  const pricing = usePricingRulesQuery();
  const providers = useProvidersQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'sell', trafficType: 'transactional', partsFrom: 1, partsTo: 1, currency: 'ETB', isActive: 'true' },
  });

  const providerNameById = useMemo(
    () => new Map((providers.data ?? []).map((provider) => [provider.id, provider.name])),
    [providers.data],
  );

  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (pricing.data ?? []).filter((rule) => {
      if (filters.kind && rule.kind !== filters.kind) {
        return false;
      }
      if (filters.providerId && String(rule.providerId ?? '') !== filters.providerId) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        String(rule.id) === search
        || rule.kind.toLowerCase().includes(search)
        || (rule.countryCode ?? '').toLowerCase().includes(search)
        || String(rule.providerId ?? '').includes(search)
      );
    });
  }, [filters.kind, filters.providerId, filters.search, pricing.data]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataGridColumn<PricingRuleItem>[] = [
    {
      id: 'rule',
      header: 'Rule',
      accessor: (row) => row.id,
      cell: (rule) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">#{rule.id}</span>
            <CopyButton value={String(rule.id)} label="Copy pricing rule ID" />
          </div>
          <p className="text-xs text-slate-500">{rule.kind} • {rule.countryCode ?? 'All destinations'}</p>
        </div>
      ),
    },
    {
      id: 'provider',
      header: 'Provider',
      accessor: (row) => providerNameById.get(row.providerId ?? 0) ?? '',
      cell: (rule) => rule.providerId ? (providerNameById.get(rule.providerId) ?? `Provider #${rule.providerId}`) : 'Tenant sell-side',
    },
    {
      id: 'traffic',
      header: 'Traffic / parts',
      accessor: (row) => `${row.trafficType}:${row.partsFrom}-${row.partsTo}`,
      cell: (rule) => `${rule.trafficType} • ${rule.partsFrom}-${rule.partsTo} part(s)`,
    },
    {
      id: 'price',
      header: 'Unit price',
      accessor: (row) => row.unitPriceMinor,
      cell: (rule) => formatMinorUnits(rule.unitPriceMinor, rule.currency),
    },
    {
      id: 'effective',
      header: 'Effective',
      accessor: (row) => row.effectiveFrom,
      cell: (rule) => (
        <div className="text-sm text-slate-600">
          <div>{formatDateTime(rule.effectiveFrom)}</div>
          <div className="text-xs text-slate-500">{rule.effectiveTo ? `Until ${formatDateTime(rule.effectiveTo)}` : 'Open ended'}</div>
        </div>
      ),
    },
    {
      id: 'active',
      header: 'Active',
      accessor: (row) => row.isActive ? 1 : 0,
      cell: (rule) => <StatusBadge value={rule.isActive ? 'active' : 'inactive'} />,
    },
  ];

  if (pricing.isLoading || providers.isLoading) {
    return <InlineLoader label="Loading pricing rules" />;
  }

  if (pricing.isError || providers.isError || !pricing.data) {
    return <ErrorPanel title="Pricing unavailable" error={pricing.error ?? providers.error} onRetry={async () => {
      await Promise.all([pricing.refetch(), providers.refetch()]);
    }} />;
  }

  return (
    <RoleGuard allowedRoles={['admin', 'support']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Admin" title="Pricing rules" description="Manage sell-side and provider cost pricing with explicit confirmation before live billing metadata changes." />

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <AppCard className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Create pricing rule</h2>
            <form className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Kind">
                  <Select {...form.register('kind')}>
                    <option value="sell">Sell</option>
                    <option value="cost">Cost</option>
                  </Select>
                </Field>
                <Field label="Provider">
                  <Select {...form.register('providerId', { valueAsNumber: true })}>
                    <option value="">Tenant sell-side rule</option>
                    {providers.data?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                  </Select>
                </Field>
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
                <Field label="Parts from">
                  <Input type="number" {...form.register('partsFrom', { valueAsNumber: true })} />
                </Field>
                <Field label="Parts to">
                  <Input type="number" {...form.register('partsTo', { valueAsNumber: true })} />
                </Field>
                <Field label="Unit price (minor units)" error={form.formState.errors.unitPriceMinor?.message}>
                  <Input type="number" {...form.register('unitPriceMinor', { valueAsNumber: true })} />
                </Field>
                <Field label="Currency">
                  <Input maxLength={3} {...form.register('currency')} />
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
                title="Create pricing rule"
                confirmText="Pricing rule changes affect billing visibility, route economics, and cost reporting."
                confirmLabel="Save pricing rule"
                requireReauth
                beforeOpen={() => form.trigger()}
                onConfirm={async ({ reauthToken } = {}) => {
                  await form.handleSubmit(async (values) => {
                    await apiRequest('/routing/pricing-rules', {
                      method: 'POST',
                      headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
                      body: JSON.stringify({
                        ...values,
                        providerId: values.providerId || undefined,
                        countryCode: values.countryCode || undefined,
                        currency: values.currency.toUpperCase(),
                        isActive: values.isActive === 'true',
                      }),
                    });
                    toast.success('Pricing rule saved.');
                    form.reset({ kind: 'sell', trafficType: 'transactional', partsFrom: 1, partsTo: 1, currency: 'ETB', isActive: 'true' });
                    await pricing.refetch();
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
                <Input value={filters.search} placeholder="Rule ID, country, provider" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
              </Field>
              <Field label="Kind">
                <Select value={filters.kind} onChange={(event) => applyFilters({ ...filters, kind: event.target.value, page: '1' })}>
                  <option value="">All kinds</option>
                  <option value="sell">Sell</option>
                  <option value="cost">Cost</option>
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
              emptyMessage="No pricing rules matched the current filters."
              pagination={{
                page,
                pageSize,
                total: filteredRows.length,
                onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
                onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
              }}
              visibilityStorageKey="pricing-rules-grid-columns"
            />
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
