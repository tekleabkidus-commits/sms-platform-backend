'use client';

import { AreaTrendChart, TrendChart } from '@/components/ui/charts';
import { AppCard, DataTable, EmptyState, InlineLoader, MetricCard, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { useDashboardQuery } from '@/lib/hooks';
import { formatCompactNumber, formatMinorUnits, formatPercent } from '@/lib/utils';
import { useSessionData } from '@/lib/session-context';

export default function DashboardPage(): React.ReactElement {
  const { tenant } = useSessionData();
  const dashboard = useDashboardQuery();

  if (dashboard.isLoading) {
    return <InlineLoader label="Loading tenant dashboard" />;
  }

  if (dashboard.isError || !dashboard.data) {
    return <EmptyState title="Dashboard unavailable" description="The tenant dashboard could not be loaded from the backend." />;
  }

  const data = dashboard.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenant dashboard"
        title="Delivery, spend, and policy posture"
        description={`Live operational view for ${tenant.name}, including wallet balance, delivery performance, active campaigns, and provider conditions currently affecting this tenant.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Available balance" value={formatMinorUnits(data.wallet.availableBalanceMinor, data.wallet.currency)} hint="Wallet funds ready for new traffic" />
        <MetricCard label="Reserved balance" value={formatMinorUnits(data.wallet.reservedBalanceMinor, data.wallet.currency)} hint="Funds currently held for in-flight traffic" />
        <MetricCard label="Today's sent" value={formatCompactNumber(data.today.sent)} hint={`${formatPercent(data.trends.at(-1)?.deliveryRate ?? 0)} delivery rate`} />
        <MetricCard label="Current TPS" value={data.today.currentTpsUsage.toFixed(2)} hint="Accepted messages per second over the last minute" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <TrendChart
          title="Delivery trend"
          description="Accepted and delivered volume over the last seven days."
          data={data.trends}
          lines={[
            { key: 'acceptedTotal', color: '#0f766e' },
            { key: 'deliveredTotal', color: '#0f172a' },
          ]}
        />
        <AreaTrendChart
          title="Spend trend"
          description="Tenant sell-side spend over the last seven days."
          data={data.trends}
          dataKey="spendMinor"
          color="#ea580c"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AppCard className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-950">Campaign posture</h3>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Total" value={String(data.campaigns.total)} />
            <MetricCard label="Scheduled" value={String(data.campaigns.scheduled)} />
            <MetricCard label="Active schedules" value={String(data.campaigns.activeSchedules)} />
            <MetricCard label="Running jobs" value={String(data.campaigns.runningJobs)} />
          </div>
        </AppCard>

        <AppCard className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-950">Sender ID summary</h3>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Approved" value={String(data.senderIds.approved)} />
            <MetricCard label="Pending" value={String(data.senderIds.pending)} />
            <MetricCard label="Rejected" value={String(data.senderIds.rejected)} />
          </div>
        </AppCard>

        <AppCard className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-950">Policy warnings</h3>
          <div className="grid gap-3">
            <MetricCard label="Fraud / policy warnings" value={String(data.fraudWarnings)} hint="Triggered by recent throttles, fraud checks, or policy blocks" />
            <MetricCard label="Tracked API keys" value={String(data.apiKeyUsage.length)} hint="Active usage over the last 24 hours" />
          </div>
        </AppCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <AppCard className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-950">Provider health in use</h3>
          <div className="space-y-3">
            {data.providers.length === 0 ? (
              <p className="text-sm text-slate-500">No recent provider health samples are associated with this tenant yet.</p>
            ) : data.providers.map((provider) => (
              <div key={provider.providerId} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Provider #{provider.providerId}</p>
                  <p className="text-xs text-slate-500">
                    {provider.avgLatencyMs.toFixed(0)} ms avg latency • {(provider.avgErrorRate * 100).toFixed(1)}% avg errors
                  </p>
                </div>
                <StatusBadge value={provider.latestStatus} />
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-950">Recent failures</h3>
          <DataTable
            columns={['Message', 'Destination', 'Status', 'Error']}
            rows={data.recentFailures.map((failure) => ([
              <div key={`${failure.id}-msg`}>
                <p className="font-medium text-slate-900">#{failure.id}</p>
                <p className="text-xs text-slate-500">{failure.submitDate}</p>
              </div>,
              <span key={`${failure.id}-phone`}>{failure.phoneNumber}</span>,
              <StatusBadge key={`${failure.id}-status`} value={failure.status} />,
              <div key={`${failure.id}-err`}>
                <p className="font-medium text-slate-800">{failure.lastErrorCode ?? 'unknown'}</p>
                <p className="text-xs text-slate-500">{failure.lastErrorMessage ?? 'No description recorded'}</p>
              </div>,
            ]))}
          />
        </AppCard>
      </div>
    </div>
  );
}
