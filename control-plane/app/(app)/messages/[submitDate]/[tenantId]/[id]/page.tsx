'use client';

import { use, useMemo } from 'react';
import { AppCard, DataTable, EmptyState, InlineLoader, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { useMessageTraceQuery } from '@/lib/hooks';
import { formatDateTime, formatMinorUnits } from '@/lib/utils';

export default function MessageTracePage({
  params,
}: {
  params: Promise<{ submitDate: string; tenantId: string; id: string }>;
}): React.ReactElement {
  const resolvedParams = use(params);
  const numericId = useMemo(() => Number(resolvedParams.id), [resolvedParams.id]);
  const trace = useMessageTraceQuery(resolvedParams.submitDate, resolvedParams.tenantId, numericId);

  if (trace.isLoading) {
    return <InlineLoader label="Loading message trace" />;
  }

  if (trace.isError || !trace.data) {
    return <EmptyState title="Trace unavailable" description="The backend could not resolve the message trace." />;
  }

  const { message, correlation, timeline, billing, dlrHistory, routingDecision } = trace.data;
  const summaryRows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Status', value: <StatusBadge key="status" value={message.status} /> },
    { label: 'Destination', value: message.phoneNumber },
    { label: 'Sender', value: String(message.routePreview?.senderId ?? 'Recorded in logs') },
    { label: 'Accepted', value: formatDateTime(message.acceptedAt) },
    { label: 'Delivered', value: formatDateTime(message.deliveredAt) },
    { label: 'Failed', value: formatDateTime(message.failedAt) },
    { label: 'Charge', value: formatMinorUnits(message.priceMinor) },
    { label: 'Billing state', value: message.billingState },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Message trace"
        title={`Message #${message.id}`}
        description={`Full lifecycle trace for ${message.phoneNumber}, including state transitions, billing effects, routing, and DLR history.`}
      />

      <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Summary</h2>
          <dl className="grid gap-3 text-sm">
            {summaryRows.map(({ label, value }) => (
              <div key={label} className="grid grid-cols-[120px_1fr] gap-3">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </AppCard>

        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Correlation and routing</h2>
          <dl className="grid gap-3 md:grid-cols-2">
            {[
              ['Client message ID', correlation.clientMessageId ?? '—'],
              ['API idempotency key', correlation.apiIdempotencyKey ?? '—'],
              ['Provider message ID', correlation.providerMessageId ?? '—'],
              ['Route rule', routingDecision.routeRuleId ?? '—'],
              ['SMPP config', routingDecision.smppConfigId ?? '—'],
              ['Attempt count', routingDecision.attemptCount],
              ['Last error code', routingDecision.lastErrorCode ?? '—'],
              ['Last error message', routingDecision.lastErrorMessage ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 px-4 py-3">
                <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </AppCard>
      </div>

      <AppCard className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-950">State timeline</h2>
        <div className="space-y-3">
          {timeline.map((entry) => (
            <div key={`${entry.eventType}-${entry.createdAt}`} className="rounded-2xl border border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{entry.eventType}</p>
                  <p className="text-xs text-slate-500">
                    {entry.statusFrom ?? '—'} → {entry.statusTo ?? '—'} • attempt {entry.attemptNo}
                  </p>
                </div>
                <p className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
              </div>
              <pre className="mt-3 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(entry.payload, null, 2)}</pre>
            </div>
          ))}
        </div>
      </AppCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Billing impact</h2>
          <DataTable
            columns={['Kind', 'Amount', 'Before', 'After', 'Created']}
            rows={billing.map((entry) => ([
              entry.kind,
              formatMinorUnits(entry.amountMinor, entry.currency),
              formatMinorUnits(entry.balanceBeforeMinor, entry.currency),
              formatMinorUnits(entry.balanceAfterMinor, entry.currency),
              formatDateTime(entry.createdAt),
            ]))}
          />
        </AppCard>
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">DLR history</h2>
          <DataTable
            columns={['Status', 'Processed', 'Received', 'Notes']}
            rows={dlrHistory.map((entry) => ([
              <StatusBadge key={`${entry.id}-status`} value={entry.normalizedStatus} />,
              entry.processed ? 'Yes' : 'No',
              formatDateTime(entry.receivedAt),
              entry.processingError ?? 'Matched cleanly',
            ]))}
          />
        </AppCard>
      </div>
    </div>
  );
}
