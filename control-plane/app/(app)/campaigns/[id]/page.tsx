'use client';

import Link from 'next/link';
import { use } from 'react';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { AppCard, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { CampaignDetail } from '@/lib/api-types';
import { useCampaignDetailQuery } from '@/lib/hooks';
import { useSessionData } from '@/lib/session-context';
import { formatCompactNumber, formatDateTime } from '@/lib/utils';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function progressValue(job: CampaignDetail['jobs'][number]): number {
  if (job.totalRecords <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((job.processedRecords / job.totalRecords) * 100));
}

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const resolvedParams = use(params);
  const session = useSessionData();
  const campaignId = Number(resolvedParams.id);
  const campaign = useCampaignDetailQuery(campaignId);

  if (campaign.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Campaigns" title="Campaign detail" description="Loading campaign detail and job telemetry." />
        <AppCard className="text-sm text-slate-500">Loading campaign detail…</AppCard>
      </div>
    );
  }

  if (campaign.isError || !campaign.data) {
    return <ErrorPanel title="Campaign unavailable" error={campaign.error ?? new Error('Campaign detail was not returned.')} onRetry={() => campaign.refetch()} />;
  }

  const detail = campaign.data;
  const metadata = detail.metadata ?? {};
  const canCancel = ['owner', 'admin', 'developer'].includes(session.user.role) && detail.status !== 'cancelled';
  const templateRef = asString(metadata.templateRef) ?? detail.schedules[0]?.templateRef ?? null;
  const senderId = asString(metadata.senderId) ?? detail.schedules[0]?.senderId ?? null;
  const trafficType = asString(metadata.trafficType);
  const uploadIds = Array.from(new Set(detail.schedules.flatMap((schedule) => schedule.contactUploadId ? [schedule.contactUploadId] : [])));
  const groupIds = Array.from(new Set(detail.schedules.flatMap((schedule) => schedule.contactGroupId ? [schedule.contactGroupId] : [])));
  const runningJobs = detail.jobs.filter((job) => ['queued', 'running', 'expanding'].includes(job.status)).length;

  const jobColumns: DataGridColumn<CampaignDetail['jobs'][number]>[] = [
    {
      id: 'job',
      header: 'Job',
      accessor: (row) => row.id,
      cell: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">#{row.id}</span>
            <CopyButton value={String(row.id)} label="Copy campaign job ID" />
          </div>
          <p className="text-xs text-slate-500">{formatDateTime(row.createdAt, session.tenant.timezone)}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      id: 'progress',
      header: 'Progress',
      accessor: (row) => progressValue(row),
      cell: (row) => (
        <div className="min-w-48 space-y-2">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{row.processedRecords}/{row.totalRecords}</span>
            <span>{progressValue(row)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-teal-500 transition-[width]"
              style={{ width: `${progressValue(row)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'results',
      header: 'Accepted / failed',
      accessor: (row) => row.acceptedRecords - row.failedRecords,
      cell: (row) => `${row.acceptedRecords} accepted • ${row.failedRecords} failed`,
    },
    {
      id: 'error',
      header: 'Last error',
      accessor: (row) => row.lastError ?? '',
      cell: (row) => row.lastError ?? '—',
    },
  ];

  const scheduleColumns: DataGridColumn<CampaignDetail['schedules'][number]>[] = [
    {
      id: 'schedule',
      header: 'Schedule',
      accessor: (row) => row.id,
      cell: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">#{row.id}</span>
            <CopyButton value={String(row.id)} label="Copy campaign schedule ID" />
          </div>
          <p className="text-xs text-slate-500">{row.recurrenceCron ?? 'One-time schedule'}</p>
        </div>
      ),
    },
    {
      id: 'template',
      header: 'Template / sender',
      accessor: (row) => `${row.templateRef}:${row.senderId}`,
      cell: (row) => `${row.templateRef} • ${row.senderId}`,
    },
    {
      id: 'nextRun',
      header: 'Next run',
      accessor: (row) => row.nextRunAt,
      cell: (row) => formatDateTime(row.nextRunAt, row.timezone),
    },
    {
      id: 'links',
      header: 'Related source',
      cell: (row) => (
        <div className="flex flex-wrap gap-2 text-sm">
          {row.contactGroupId ? <Link className="text-teal-700 hover:text-teal-600" href={`/contacts/groups/${row.contactGroupId}`}>Group #{row.contactGroupId}</Link> : null}
          {row.contactUploadId ? <Link className="text-teal-700 hover:text-teal-600" href={`/contacts/uploads/${row.contactUploadId}`}>Upload #{row.contactUploadId}</Link> : null}
          {!row.contactGroupId && !row.contactUploadId ? <span className="text-slate-500">API-driven</span> : null}
        </div>
      ),
    },
    {
      id: 'active',
      header: 'Active',
      accessor: (row) => row.isActive ? 1 : 0,
      cell: (row) => <StatusBadge value={row.isActive ? 'active' : 'inactive'} />,
    },
  ];

  const failureColumns: DataGridColumn<CampaignDetail['recentFailures'][number]>[] = [
    {
      id: 'message',
      header: 'Message',
      accessor: (row) => row.id,
      cell: (row) => (
        <Link href={`/messages/${row.submitDate}/${session.tenant.id}/${row.id}`} className="font-medium text-teal-700 hover:text-teal-600">
          #{row.id}
        </Link>
      ),
    },
    {
      id: 'phone',
      header: 'Destination',
      accessor: (row) => row.phoneNumber,
      cell: (row) => row.phoneNumber,
    },
    {
      id: 'errorCode',
      header: 'Error code',
      accessor: (row) => row.lastErrorCode ?? '',
      cell: (row) => row.lastErrorCode ?? '—',
    },
    {
      id: 'error',
      header: 'Error',
      accessor: (row) => row.lastErrorMessage ?? '',
      cell: (row) => row.lastErrorMessage ?? 'No error message recorded',
    },
    {
      id: 'failedAt',
      header: 'Failed',
      accessor: (row) => row.failedAt ?? '',
      cell: (row) => formatDateTime(row.failedAt, session.tenant.timezone),
    },
  ];

  const auditColumns: DataGridColumn<CampaignDetail['auditTrail'][number]>[] = [
    { id: 'action', header: 'Action', accessor: (row) => row.action, cell: (row) => row.action },
    { id: 'createdAt', header: 'Created', accessor: (row) => row.createdAt, cell: (row) => formatDateTime(row.createdAt, session.tenant.timezone) },
    {
      id: 'metadata',
      header: 'Metadata',
      accessor: (row) => JSON.stringify(row.metadata),
      cell: (row) => (
        <pre className="max-w-xl overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">
          {JSON.stringify(row.metadata, null, 2)}
        </pre>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campaign detail"
        title={detail.name}
        description="Inspect schedule context, live job progress, message outcomes, related uploads, and audit activity for one campaign."
        actions={(
          <div className="flex flex-wrap gap-3">
            <Link href={`/messages?campaignId=${detail.id}`} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
              View related messages
            </Link>
            {canCancel ? (
              <ConfirmButton
                variant="danger"
                title={`Cancel ${detail.name}`}
                confirmText="Cancelling a campaign stops any active schedules and prevents further materialization."
                requireText={detail.name}
                requireReauth
                confirmLabel="Cancel campaign"
                onConfirm={async ({ reauthToken } = {}) => {
                  await apiRequest(`/campaigns/${detail.id}/cancel`, {
                    method: 'POST',
                    headers: reauthToken ? { 'x-reauth-token': reauthToken } : undefined,
                  });
                  toast.success('Campaign cancelled.');
                  await campaign.refetch();
                }}
              >
                Cancel campaign
              </ConfirmButton>
            ) : null}
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Campaign summary</h2>
          <dl className="grid gap-3 text-sm">
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Status</dt>
              <dd><StatusBadge value={detail.status} /></dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Campaign ID</dt>
              <dd className="flex items-center gap-2 font-medium text-slate-900">
                #{detail.id}
                <CopyButton value={String(detail.id)} label="Copy campaign ID" />
              </dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Scheduled</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(detail.scheduledAt, session.tenant.timezone)}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Template</dt>
              <dd className="font-medium text-slate-900">{templateRef ?? 'Not recorded'}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Sender</dt>
              <dd className="font-medium text-slate-900">{senderId ?? 'Not recorded'}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Traffic type</dt>
              <dd className="font-medium text-slate-900">{trafficType ?? 'Inherited from message submit context'}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Uploads</dt>
              <dd className="flex flex-wrap gap-2">
                {uploadIds.length > 0 ? uploadIds.map((uploadId) => (
                  <Link key={uploadId} href={`/contacts/uploads/${uploadId}`} className="text-teal-700 hover:text-teal-600">
                    Upload #{uploadId}
                  </Link>
                )) : <span className="text-slate-500">No upload source</span>}
              </dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <dt className="text-slate-500">Contact groups</dt>
              <dd className="flex flex-wrap gap-2">
                {groupIds.length > 0 ? groupIds.map((groupId) => (
                  <Link key={groupId} href={`/contacts/groups/${groupId}`} className="text-teal-700 hover:text-teal-600">
                    Group #{groupId}
                  </Link>
                )) : <span className="text-slate-500">No group source</span>}
              </dd>
            </div>
          </dl>
        </AppCard>

        <div className="grid gap-6 md:grid-cols-2">
          {[
            { label: 'Total records', value: detail.performance.totalRecords },
            { label: 'Accepted', value: detail.performance.acceptedRecords },
            { label: 'Delivered', value: detail.performance.deliveredRecords },
            { label: 'Failed', value: detail.performance.failedRecords },
            { label: 'Pending', value: detail.performance.pendingRecords },
            { label: 'Running jobs', value: runningJobs },
          ].map((item) => (
            <AppCard key={item.label}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCompactNumber(item.value)}</p>
            </AppCard>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AppCard>
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Schedules and recurrence</h2>
          <DataGrid
            columns={scheduleColumns}
            data={detail.schedules}
            getRowId={(row) => row.id}
            emptyMessage="This campaign does not have any schedules yet."
            visibilityStorageKey="campaign-detail-schedules-columns"
          />
        </AppCard>
        <AppCard>
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Campaign jobs</h2>
          <DataGrid
            columns={jobColumns}
            data={detail.jobs}
            getRowId={(row) => row.id}
            emptyMessage="No jobs have been created for this campaign yet."
            visibilityStorageKey="campaign-detail-jobs-columns"
          />
        </AppCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AppCard>
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Recent failed records</h2>
          <DataGrid
            columns={failureColumns}
            data={detail.recentFailures}
            getRowId={(row) => `${row.submitDate}-${row.id}`}
            emptyMessage="No failed campaign messages are currently recorded."
            visibilityStorageKey="campaign-detail-failures-columns"
          />
        </AppCard>
        <AppCard>
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Audit and control-plane context</h2>
          <DataGrid
            columns={auditColumns}
            data={detail.auditTrail}
            getRowId={(row) => row.id}
            emptyMessage="No campaign audit entries were returned for this tenant scope."
            visibilityStorageKey="campaign-detail-audit-columns"
          />
        </AppCard>
      </div>
    </div>
  );
}
