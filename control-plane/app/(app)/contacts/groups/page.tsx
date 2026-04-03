'use client';

import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { AppCard, Button, DataTable, EmptyState, Field, InlineLoader, Input, PageHeader } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { useContactGroupsQuery } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(3),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export default function ContactGroupsPage(): React.ReactElement {
  const groups = useContactGroupsQuery();
  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(schema),
  });

  if (groups.isLoading) {
    return <InlineLoader label="Loading contact groups" />;
  }

  if (groups.isError || !groups.data) {
    return <EmptyState title="Groups unavailable" description="The contact groups list could not be loaded from the backend." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contact groups"
        title="Group recipients for bulk sends"
        description="Use groups as reusable audience segments for campaigns and scheduled messaging."
      />

      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Create group</h2>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await apiRequest('/contact-groups', {
                  method: 'POST',
                  body: JSON.stringify(values),
                });
                toast.success('Contact group created.');
                form.reset();
                await groups.refetch();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Unable to create group');
              }
            })}
          >
            <Field label="Group name" error={form.formState.errors.name?.message}>
              <Input placeholder="April subscribers" {...form.register('name')} />
            </Field>
            <Button type="submit" loading={form.formState.isSubmitting}>Create group</Button>
          </form>
        </AppCard>

        <AppCard>
          <DataTable
            columns={['Group', 'Members', 'Created']}
            rows={groups.data.map((group) => ([
              <Link key={`${group.id}-link`} href={`/contacts/groups/${group.id}`} className="font-medium text-slate-900 hover:text-teal-700">
                {group.name}
              </Link>,
              String(group.memberCount ?? 0),
              formatDateTime(group.createdAt),
            ]))}
          />
        </AppCard>
      </div>
    </div>
  );
}
