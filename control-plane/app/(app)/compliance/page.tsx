'use client';

import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { RoleGuard } from '@/components/role-guard';
import { AppCard, Button, Field, InlineLoader, Input, PageHeader, Select, StatusBadge } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { ComplianceEntry, FraudEventItem, FraudRuleItem } from '@/lib/api-types';
import { useComplianceQuery, useFraudEventsQuery, useFraudRulesQuery } from '@/lib/hooks';
import { useUrlFilters } from '@/lib/use-url-filters';
import { formatDateTime } from '@/lib/utils';

const complianceSchema = z.object({
  phoneNumber: z.string().min(8),
  reason: z.string().optional(),
});

const DEFAULT_FILTERS = {
  search: '',
  type: '',
  page: '1',
  limit: '10',
};

function buildListRows(optOuts: ComplianceEntry[], suppressions: ComplianceEntry[]) {
  return [
    ...optOuts.map((entry) => ({ ...entry, listType: 'opt_out' as const })),
    ...suppressions.map((entry) => ({ ...entry, listType: 'suppression' as const })),
  ];
}

export default function CompliancePage(): React.ReactElement {
  const optOuts = useComplianceQuery('/compliance/opt-outs');
  const suppressions = useComplianceQuery('/compliance/suppressions');
  const fraudRules = useFraudRulesQuery();
  const fraudEvents = useFraudEventsQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const form = useForm<z.infer<typeof complianceSchema>>({
    resolver: zodResolver(complianceSchema),
  });

  const combinedList = useMemo(
    () => buildListRows(optOuts.data ?? [], suppressions.data ?? []),
    [optOuts.data, suppressions.data],
  );

  const filteredList = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return combinedList.filter((entry) => {
      if (filters.type && entry.listType !== filters.type) {
        return false;
      }
      if (!search) {
        return true;
      }
      return entry.phoneNumber.toLowerCase().includes(search) || (entry.reason ?? '').toLowerCase().includes(search);
    });
  }, [combinedList, filters.search, filters.type]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const listRows = filteredList.slice((page - 1) * pageSize, page * pageSize);

  const fraudRuleColumns: DataGridColumn<FraudRuleItem>[] = [
    {
      id: 'rule',
      header: 'Rule',
      accessor: (row) => row.name,
      cell: (rule) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{rule.name}</span>
            <CopyButton value={String(rule.id)} label="Copy fraud rule ID" />
          </div>
          <p className="text-xs text-slate-500">{rule.ruleType}</p>
        </div>
      ),
    },
    { id: 'action', header: 'Action', accessor: (row) => row.action, cell: (rule) => rule.action },
    { id: 'values', header: 'Values', accessor: (row) => row.values.join(','), cell: (rule) => rule.values.join(', ') },
    { id: 'active', header: 'Active', accessor: (row) => row.isActive ? 1 : 0, cell: (rule) => <StatusBadge value={rule.isActive ? 'active' : 'inactive'} /> },
  ];

  const fraudEventColumns: DataGridColumn<FraudEventItem>[] = [
    {
      id: 'message',
      header: 'Message',
      accessor: (row) => row.messageId,
      cell: (event) => (
        <div className="flex items-center gap-2">
          <span>#{event.messageId}</span>
          <CopyButton value={`${event.messageSubmitDate}/${event.messageId}`} label="Copy fraud event message reference" />
        </div>
      ),
    },
    { id: 'event', header: 'Event', accessor: (row) => row.eventType, cell: (event) => event.eventType },
    { id: 'created', header: 'Created', accessor: (row) => row.createdAt, cell: (event) => formatDateTime(event.createdAt) },
  ];

  const listColumns: DataGridColumn<(typeof combinedList)[number]>[] = [
    {
      id: 'type',
      header: 'List',
      accessor: (row) => row.listType,
      cell: (entry) => entry.listType === 'opt_out' ? 'Opt-out' : 'Suppression',
    },
    {
      id: 'phone',
      header: 'Phone number',
      accessor: (row) => row.phoneNumber,
      cell: (entry) => (
        <div className="flex items-center gap-2">
          <span>{entry.phoneNumber}</span>
          <CopyButton value={entry.phoneNumber} label="Copy phone number" />
        </div>
      ),
    },
    { id: 'reason', header: 'Reason', accessor: (row) => row.reason ?? '', cell: (entry) => entry.reason ?? '—' },
    { id: 'created', header: 'Created', accessor: (row) => row.createdAt, cell: (entry) => formatDateTime(entry.createdAt) },
  ];

  if (optOuts.isLoading || suppressions.isLoading || fraudRules.isLoading || fraudEvents.isLoading) {
    return <InlineLoader label="Loading compliance console" />;
  }

  if (optOuts.isError || suppressions.isError || fraudRules.isError || fraudEvents.isError || !optOuts.data || !suppressions.data || !fraudRules.data || !fraudEvents.data) {
    return <ErrorPanel title="Compliance console unavailable" error={optOuts.error ?? suppressions.error ?? fraudRules.error ?? fraudEvents.error} onRetry={async () => {
      await Promise.all([optOuts.refetch(), suppressions.refetch(), fraudRules.refetch(), fraudEvents.refetch()]);
    }} />;
  }

  return (
    <RoleGuard allowedRoles={['owner', 'admin', 'support']}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Compliance"
          title="Fraud, suppression, and opt-outs"
          description="Review blocked destinations, fraud rules, and recent policy-triggered events without inventing ML-only signals."
        />

        <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <AppCard className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Add suppression / opt-out</h2>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                try {
                  await apiRequest('/compliance/suppressions', {
                    method: 'POST',
                    body: JSON.stringify(values),
                  });
                  await apiRequest('/compliance/opt-outs', {
                    method: 'POST',
                    body: JSON.stringify(values),
                  });
                  toast.success('Suppression and opt-out updated.');
                  form.reset();
                  await Promise.all([optOuts.refetch(), suppressions.refetch()]);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Unable to save compliance entry');
                }
              })}
            >
              <Field label="Phone number">
                <Input placeholder="+251911234567" {...form.register('phoneNumber')} />
              </Field>
              <Field label="Reason">
                <Input placeholder="Customer requested opt-out" {...form.register('reason')} />
              </Field>
              <Button type="submit" loading={form.formState.isSubmitting}>Save entry</Button>
            </form>
          </AppCard>

          <div className="space-y-6">
            <AppCard>
              <h2 className="mb-4 text-lg font-semibold text-slate-950">Fraud rules</h2>
              <DataGrid columns={fraudRuleColumns} data={fraudRules.data} getRowId={(row) => row.id} emptyMessage="No fraud rules are currently configured." visibilityStorageKey="fraud-rules-grid-columns" />
            </AppCard>
            <AppCard>
              <h2 className="mb-4 text-lg font-semibold text-slate-950">Recent fraud events</h2>
              <DataGrid columns={fraudEventColumns} data={fraudEvents.data} getRowId={(row) => `${row.messageSubmitDate}-${row.messageId}-${row.createdAt}`} emptyMessage="No recent fraud or policy events were returned." visibilityStorageKey="fraud-events-grid-columns" />
            </AppCard>
            <AppCard className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-950">Opt-outs and suppressions</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Search">
                  <Input value={filters.search} placeholder="Phone number or reason" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
                </Field>
                <Field label="List type">
                  <Select value={filters.type} onChange={(event) => applyFilters({ ...filters, type: event.target.value, page: '1' })}>
                    <option value="">All entries</option>
                    <option value="opt_out">Opt-outs</option>
                    <option value="suppression">Suppressions</option>
                  </Select>
                </Field>
              </div>
              <DataGrid
                columns={listColumns}
                data={listRows}
                getRowId={(row) => `${row.listType}-${row.id}`}
                emptyMessage="No compliance entries matched the current filters."
                pagination={{
                  page,
                  pageSize,
                  total: filteredList.length,
                  onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
                  onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
                }}
                visibilityStorageKey="compliance-lists-grid-columns"
              />
            </AppCard>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
