'use client';

import { use } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { AppCard, Button, DataTable, EmptyState, Field, InlineLoader, Input, PageHeader, Textarea } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { useContactDetailQuery } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

const schema = z.object({
  name: z.string().optional(),
  metadataJson: z.string().default('{}'),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const resolvedParams = use(params);
  const contact = useContactDetailQuery(Number(resolvedParams.id));
  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      metadataJson: '{}',
    },
  });

  if (contact.isLoading) {
    return <InlineLoader label="Loading contact detail" />;
  }

  if (contact.isError || !contact.data) {
    return <EmptyState title="Contact unavailable" description="The backend could not resolve this contact." />;
  }

  const data = contact.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contact detail"
        title={data.phoneNumber}
        description="Review recipient metadata, linked groups, and update the contact safely."
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Edit contact</h2>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await apiRequest(`/contacts/${data.id}`, {
                  method: 'PUT',
                  body: JSON.stringify({
                    name: values.name || undefined,
                    metadata: values.metadataJson.trim() ? JSON.parse(values.metadataJson) : undefined,
                  }),
                });
                toast.success('Contact updated.');
                await contact.refetch();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Unable to update contact');
              }
            })}
          >
            <Field label="Name">
              <Input defaultValue={data.name ?? ''} {...form.register('name')} />
            </Field>
            <Field label="Metadata JSON" hint="Merged into the existing metadata object.">
              <Textarea rows={10} defaultValue={JSON.stringify(data.metadata, null, 2)} {...form.register('metadataJson')} />
            </Field>
            <Button type="submit" loading={form.formState.isSubmitting}>Save changes</Button>
          </form>
        </AppCard>

        <div className="space-y-6">
          <AppCard className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Contact summary</h2>
            <dl className="grid gap-3 text-sm">
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <dt className="text-slate-500">Phone number</dt>
                <dd className="font-medium text-slate-900">{data.phoneNumber}</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <dt className="text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">{data.name ?? '—'}</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium text-slate-900">{formatDateTime(data.createdAt)}</dd>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <dt className="text-slate-500">Updated</dt>
                <dd className="font-medium text-slate-900">{formatDateTime(data.updatedAt)}</dd>
              </div>
            </dl>
          </AppCard>

          <AppCard className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Group membership</h2>
            <DataTable
              columns={['Group', 'ID']}
              rows={data.groups.map((group) => ([
                group.name,
                String(group.id),
              ]))}
              emptyMessage="This contact is not linked to any groups yet."
            />
          </AppCard>
        </div>
      </div>
    </div>
  );
}
