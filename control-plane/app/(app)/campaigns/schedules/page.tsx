'use client';

import { toast } from 'sonner';
import { AppCard, DataTable, EmptyState, InlineLoader, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { apiRequest } from '@/lib/api';
import { useCampaignSchedulesQuery } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

export default function CampaignSchedulesPage(): React.ReactElement {
  const schedules = useCampaignSchedulesQuery();

  if (schedules.isLoading) {
    return <InlineLoader label="Loading campaign schedules" />;
  }

  if (schedules.isError || !schedules.data) {
    return <EmptyState title="Schedules unavailable" description="The backend schedules endpoint could not be loaded." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campaign schedules"
        title="Recurring and one-time schedules"
        description="Pause or resume schedules without losing the campaign history."
      />

      <AppCard>
        <DataTable
          columns={['Campaign', 'Template', 'Recurrence', 'Next run', 'Actions']}
          rows={schedules.data.map((schedule) => ([
            `#${String(schedule.campaignId ?? '—')}`,
            String(schedule.templateRef ?? '—'),
            String(schedule.recurrenceCron ?? 'One time'),
            formatDateTime(String(schedule.nextRunAt ?? '')),
            <div key={`${String(schedule.id)}-action`} className="flex gap-2">
              <StatusBadge value={schedule.isActive ? 'active' : 'paused'} />
              <ConfirmButton
                variant={schedule.isActive ? 'danger' : 'secondary'}
                confirmText={schedule.isActive ? 'Pause this schedule?' : 'Resume this schedule?'}
                onConfirm={async () => {
                  await apiRequest(`/campaign-schedules/${schedule.id}/${schedule.isActive ? 'pause' : 'resume'}`, { method: 'POST' });
                  toast.success(`Schedule ${schedule.isActive ? 'paused' : 'resumed'}.`);
                  await schedules.refetch();
                }}
              >
                {schedule.isActive ? 'Pause' : 'Resume'}
              </ConfirmButton>
            </div>,
          ]))}
        />
      </AppCard>
    </div>
  );
}
