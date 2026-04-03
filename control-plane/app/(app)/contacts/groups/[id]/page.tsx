'use client';

import { use } from 'react';
import { AppCard, DataTable, EmptyState, InlineLoader, PageHeader } from '@/components/ui/primitives';
import { useContactGroupDetailQuery } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

export default function ContactGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const resolvedParams = use(params);
  const group = useContactGroupDetailQuery(Number(resolvedParams.id));

  if (group.isLoading) {
    return <InlineLoader label="Loading contact group detail" />;
  }

  if (group.isError || !group.data) {
    return <EmptyState title="Group unavailable" description="The backend could not resolve this contact group." />;
  }

  const data = group.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contact group"
        title={data.name}
        description="Review the members currently available to campaign and bulk-send workflows."
      />

      <AppCard className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-950">Members</h2>
        <DataTable
          columns={['Phone number', 'Name', 'Created']}
          rows={(data.members ?? []).map((member) => ([
            member.phoneNumber,
            member.name ?? '—',
            formatDateTime(member.createdAt),
          ]))}
          emptyMessage="No members have been added to this group yet."
        />
      </AppCard>
    </div>
  );
}
