'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AppCard, Button, EmptyState, Field, InlineLoader, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { RoleGuard } from '@/components/role-guard';
import { useCampaignsQuery, useContactGroupsQuery, useSenderIdsQuery, useTemplatesQuery } from '@/lib/hooks';
import { apiRequest } from '@/lib/api';
import { estimateSmsParts } from '@/lib/utils';

const singleSendSchema = z.object({
  phoneNumber: z.string().min(8),
  senderId: z.string().min(2),
  body: z.string().optional(),
  templateRef: z.string().optional(),
  mergeDataJson: z.string().optional(),
  trafficType: z.enum(['transactional', 'otp', 'marketing']).default('transactional'),
  clientMessageId: z.string().optional(),
  scheduleAt: z.string().optional(),
});

const bulkSchema = z.object({
  senderId: z.string().min(2),
  templateRef: z.string().min(2),
  recurrenceCron: z.string().optional(),
  startAt: z.string().min(5),
  contactGroupId: z.string().optional(),
  campaignName: z.string().min(3),
  shardCount: z.coerce.number().min(1).max(32).default(4),
});

type SingleSendInput = z.input<typeof singleSendSchema>;
type SingleSendOutput = z.output<typeof singleSendSchema>;
type BulkSendInput = z.input<typeof bulkSchema>;
type BulkSendOutput = z.output<typeof bulkSchema>;

type PreviewRow = Record<string, string>;

interface UploadPreview {
  csvContent: string;
  previewRows: PreviewRow[];
  duplicateCount: number;
  fileName: string;
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || fallback;
}

async function parseUpload(file: File): Promise<UploadPreview> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension) {
    throw new Error('Unsupported file');
  }

  if (extension === 'csv') {
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0]?.split(',').map((value) => value.trim()) ?? [];
    const previewRows = lines.slice(1, 6).map((line) => {
      const values = line.split(',').map((value) => value.trim());
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    });
    const phoneIndex = headers.findIndex((header) => ['phone_number', 'phoneNumber', 'msisdn'].includes(header));
    const seen = new Set<string>();
    let duplicateCount = 0;
    for (const line of lines.slice(1)) {
      const values = line.split(',').map((value) => value.trim());
      const phone = values[phoneIndex] ?? '';
      if (seen.has(phone)) {
        duplicateCount += 1;
      }
      seen.add(phone);
    }
    return {
      csvContent: text,
      previewRows,
      duplicateCount,
      fileName: file.name,
    };
  }

  const xlsx = await import('xlsx');
  const bytes = await file.arrayBuffer();
  const workbook = xlsx.read(bytes, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  const rows = xlsx.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
  const headers = Object.keys(rows[0] ?? {});
  const csvContent = xlsx.utils.sheet_to_csv(sheet);
  const previewRows = rows.slice(0, 5).map((row) => Object.fromEntries(headers.map((header) => [header, String(row[header] ?? '')])));
  const phoneHeader = headers.find((header) => ['phone_number', 'phoneNumber', 'msisdn'].includes(header));
  const seen = new Set<string>();
  let duplicateCount = 0;
  if (phoneHeader) {
    for (const row of rows) {
      const phone = String(row[phoneHeader] ?? '');
      if (seen.has(phone)) {
        duplicateCount += 1;
      }
      seen.add(phone);
    }
  }
  return {
    csvContent,
    previewRows,
    duplicateCount,
    fileName: file.name,
  };
}

function buildTemplatePreview(templateBody: string | undefined, mergeDataJson: string | undefined): string {
  if (!templateBody) {
    return '';
  }
  let mergeData: Record<string, string | number> = {};
  if (mergeDataJson?.trim()) {
    mergeData = JSON.parse(mergeDataJson) as Record<string, string | number>;
  }
  return templateBody.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => String(mergeData[key] ?? ''));
}

export default function SendPage(): React.ReactElement {
  const templates = useTemplatesQuery();
  const senderIds = useSenderIdsQuery();
  const contactGroups = useContactGroupsQuery();
  const campaigns = useCampaignsQuery();
  const [routePreview, setRoutePreview] = useState<Record<string, unknown> | null>(null);
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);

  const singleForm = useForm<SingleSendInput, undefined, SingleSendOutput>({
    resolver: zodResolver(singleSendSchema),
    defaultValues: {
      trafficType: 'transactional',
    },
  });

  const bulkForm = useForm<BulkSendInput, undefined, BulkSendOutput>({
    resolver: zodResolver(bulkSchema),
    defaultValues: {
      shardCount: 4,
      startAt: '',
    },
  });

  const controlPlaneSend = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiRequest<Record<string, unknown>>('/messages/control-plane', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'x-idempotency-key': `ui-${Date.now()}`,
      },
    }),
    retry: false,
    onSuccess: () => toast.success('Message submitted successfully.'),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to send message'),
  });
  const watchedTemplateRef = useWatch({ control: singleForm.control, name: 'templateRef' });
  const watchedMergeDataJson = useWatch({ control: singleForm.control, name: 'mergeDataJson' });
  const watchedBody = useWatch({ control: singleForm.control, name: 'body' });
  const watchedScheduleAt = useWatch({ control: singleForm.control, name: 'scheduleAt' });

  const selectedTemplate = useMemo(
    () => templates.data?.find(
      (template) => `${template.name}@${template.version}` === watchedTemplateRef || template.name === watchedTemplateRef,
    ),
    [templates.data, watchedTemplateRef],
  );

  if (templates.isLoading || senderIds.isLoading || contactGroups.isLoading || campaigns.isLoading) {
    return <InlineLoader label="Loading send workflows" />;
  }

  if (!senderIds.data || senderIds.data.length === 0) {
    return <EmptyState title="No approved sender IDs" description="Register and approve a sender ID before sending traffic from the control plane." />;
  }

  const templatePreview = selectedTemplate ? buildTemplatePreview(selectedTemplate.body, watchedMergeDataJson) : '';
  const singleMessageText = templatePreview || watchedBody || '';
  const messageParts = estimateSmsParts(singleMessageText);

  return (
    <RoleGuard allowedRoles={['owner', 'admin', 'support', 'developer']}>
      <div className="space-y-6">
      <PageHeader
        eyebrow="Send SMS"
        title="Single and bulk submission"
        description="Use the control plane for one-off messages or schedule bulk traffic through the existing contacts and campaign pipeline."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <AppCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-950">Single send</h2>
            <p className="text-sm text-slate-600">Submit one message immediately, or schedule a single-recipient campaign when a future time is selected.</p>
          </div>

          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={singleForm.handleSubmit(async (values) => {
              try {
                const mergeData = values.mergeDataJson?.trim() ? JSON.parse(values.mergeDataJson) as Record<string, string | number> : undefined;
                if (values.scheduleAt) {
                  const singleSendId = sanitizeIdentifier(values.phoneNumber, 'single-send');
                  const csvContent = `phone_number\n${values.phoneNumber}`;
                  const upload = await apiRequest<{ uploadId: number }>('/contact-uploads/inline', {
                    method: 'POST',
                    body: JSON.stringify({
                      csvContent,
                      fileName: `${singleSendId}.csv`,
                    }),
                  });
                  await apiRequest('/campaigns/schedule', {
                    method: 'POST',
                    body: JSON.stringify({
                      campaignName: singleSendId,
                      startAt: new Date(values.scheduleAt).toISOString(),
                      templateRef: values.templateRef || undefined,
                      senderId: values.senderId,
                      contactUploadId: upload.uploadId,
                      recurrenceCron: undefined,
                      shardCount: 1,
                    }),
                  });
                  toast.success('Scheduled single-recipient campaign created.');
                  return;
                }

                await controlPlaneSend.mutateAsync({
                  phoneNumber: values.phoneNumber,
                  senderId: values.senderId,
                  body: values.templateRef ? undefined : values.body,
                  templateRef: values.templateRef || undefined,
                  mergeData,
                  trafficType: values.trafficType,
                  clientMessageId: values.clientMessageId || undefined,
                });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Unable to send message');
              }
            })}
          >
            <Field label="Destination" error={singleForm.formState.errors.phoneNumber?.message}>
              <Input placeholder="+251911234567" {...singleForm.register('phoneNumber')} />
            </Field>
            <Field label="Sender ID" error={singleForm.formState.errors.senderId?.message}>
              <Select aria-label="Sender ID (single send)" {...singleForm.register('senderId')}>
                <option value="">Select sender</option>
                {senderIds.data.map((sender) => (
                  <option key={sender.id} value={sender.senderName}>
                    {sender.senderName} ({sender.status})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Traffic type">
              <Select {...singleForm.register('trafficType')}>
                <option value="transactional">Transactional</option>
                <option value="otp">OTP</option>
                <option value="marketing">Marketing</option>
              </Select>
            </Field>
            <Field label="Schedule at">
              <Input type="datetime-local" {...singleForm.register('scheduleAt')} />
            </Field>
            <Field label="Template" hint="Optional. Choose a template or compose raw text.">
              <Select aria-label="Template (single send)" {...singleForm.register('templateRef')}>
                <option value="">Compose raw text</option>
                {templates.data?.map((template) => (
                  <option key={template.id} value={`${template.name}@${template.version}`}>
                    {template.name}@{template.version}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Client message ID">
              <Input placeholder="client-msg-1234" {...singleForm.register('clientMessageId')} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Message body" hint="Ignored when a template is selected.">
                <Textarea rows={5} placeholder="Your message body" {...singleForm.register('body')} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Merge data (JSON)" hint="Used only for templates. Example: { &quot;code&quot;: &quot;815204&quot; }">
                <Textarea rows={4} placeholder='{"code":"815204"}' {...singleForm.register('mergeDataJson')} />
              </Field>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  const values = singleForm.getValues();
                  if (!values.phoneNumber) {
                    toast.error('Enter a destination before previewing the route.');
                    return;
                  }
                  try {
                    const preview = await apiRequest<Record<string, unknown>>('/routing/preview', {
                      method: 'POST',
                      body: JSON.stringify({
                        phoneNumber: values.phoneNumber,
                        trafficType: values.trafficType,
                      }),
                    });
                    setRoutePreview(preview);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Route preview failed');
                  }
                }}
              >
                Preview route
              </Button>
              <Button type="submit" loading={controlPlaneSend.isPending}>
                {watchedScheduleAt ? 'Schedule send' : 'Send now'}
              </Button>
            </div>
          </form>

          <div className="grid gap-4 md:grid-cols-2">
            <AppCard className="space-y-3 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">Content preview</h3>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{singleMessageText || 'Message preview will appear here.'}</p>
              <p className="text-xs text-slate-500">{singleMessageText.length} characters • {messageParts} part(s)</p>
            </AppCard>
            <AppCard className="space-y-3 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">Route preview</h3>
              {routePreview ? (
                <pre className="overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(routePreview, null, 2)}</pre>
              ) : (
                <p className="text-sm text-slate-500">Preview the backend routing decision before sending.</p>
              )}
            </AppCard>
          </div>
        </AppCard>

        <AppCard className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-950">Bulk send / scheduled campaign</h2>
            <p className="text-sm text-slate-600">Use an existing contact group or upload CSV/Excel, then schedule bulk delivery through the campaign subsystem.</p>
          </div>

          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={bulkForm.handleSubmit(async (values) => {
              try {
                let contactUploadId: number | undefined;
                if (!values.contactGroupId) {
                  if (!uploadPreview) {
                    toast.error('Upload a CSV or Excel file, or choose a contact group.');
                    return;
                  }
                  const upload = await apiRequest<{ uploadId: number; invalidRows: number }>('/contact-uploads/inline', {
                    method: 'POST',
                    body: JSON.stringify({
                      csvContent: uploadPreview.csvContent,
                      fileName: sanitizeIdentifier(uploadPreview.fileName, 'bulk-upload.csv'),
                    }),
                  });
                  contactUploadId = upload.uploadId;
                  toast.success(`Upload accepted with ${upload.invalidRows} invalid rows.`);
                }

                await apiRequest('/campaigns/schedule', {
                  method: 'POST',
                  body: JSON.stringify({
                    campaignName: values.campaignName,
                    startAt: new Date(values.startAt).toISOString(),
                    recurrenceCron: values.recurrenceCron || undefined,
                    templateRef: values.templateRef,
                    senderId: values.senderId,
                    contactGroupId: values.contactGroupId ? Number(values.contactGroupId) : undefined,
                    contactUploadId,
                    shardCount: values.shardCount,
                  }),
                });
                toast.success('Bulk campaign scheduled.');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Unable to schedule campaign');
              }
            })}
          >
            <Field label="Campaign name" error={bulkForm.formState.errors.campaignName?.message}>
              <Input placeholder="April subscriber campaign" {...bulkForm.register('campaignName')} />
            </Field>
            <Field label="Start time" error={bulkForm.formState.errors.startAt?.message}>
              <Input type="datetime-local" {...bulkForm.register('startAt')} />
            </Field>
            <Field label="Sender ID" error={bulkForm.formState.errors.senderId?.message}>
              <Select aria-label="Sender ID (bulk send)" {...bulkForm.register('senderId')}>
                <option value="">Select sender</option>
                {senderIds.data.map((sender) => (
                  <option key={sender.id} value={sender.senderName}>
                    {sender.senderName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Template" error={bulkForm.formState.errors.templateRef?.message}>
              <Select aria-label="Template (bulk send)" {...bulkForm.register('templateRef')}>
                <option value="">Select template</option>
                {templates.data?.map((template) => (
                  <option key={template.id} value={`${template.name}@${template.version}`}>
                    {template.name}@{template.version}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contact group">
              <Select {...bulkForm.register('contactGroupId')}>
                <option value="">Upload new recipients instead</option>
                {contactGroups.data?.map((group) => (
                  <option key={group.id} value={String(group.id)}>
                    {group.name} ({group.memberCount ?? 0})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Shard count">
              <Input type="number" min={1} max={32} {...bulkForm.register('shardCount', { valueAsNumber: true })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Recurrence cron" hint="Optional. Leave blank for one-time bulk sends.">
                <Input placeholder="0 8 * * 1" {...bulkForm.register('recurrenceCron')} />
              </Field>
            </div>
            <div className="md:col-span-2 space-y-3">
              <label className="text-sm font-medium text-slate-800">Upload recipients</label>
              <Input
                type="file"
                aria-label="Recipient upload file"
                accept=".csv,.xlsx,.xls"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    setUploadPreview(null);
                    return;
                  }
                  try {
                    const parsed = await parseUpload(file);
                    setUploadPreview(parsed);
                    toast.success(`Prepared ${parsed.previewRows.length} preview rows.`);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Unable to parse file');
                  }
                }}
              />
              {uploadPreview ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Preview</p>
                  <p className="mt-1 text-xs text-slate-500">{uploadPreview.previewRows.length} sample rows • {uploadPreview.duplicateCount} duplicate values detected in preview scan</p>
                  <pre className="mt-3 overflow-auto rounded-2xl bg-white p-3 text-xs text-slate-700">{JSON.stringify(uploadPreview.previewRows, null, 2)}</pre>
                </div>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Create campaign</Button>
            </div>
          </form>

          <AppCard className="bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-900">Recent campaigns</h3>
            {campaigns.data && campaigns.data.length > 0 ? (
              <div className="mt-4 space-y-3">
                {campaigns.data.slice(0, 5).map((campaign) => (
                  <div key={campaign.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="font-medium text-slate-900">{campaign.name}</p>
                    <p className="text-xs text-slate-500">{campaign.status} • {campaign.latestJob?.processedRecords ?? 0}/{campaign.latestJob?.totalRecords ?? 0} processed</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No campaigns exist yet.</p>
            )}
          </AppCard>
        </AppCard>
      </div>
      </div>
    </RoleGuard>
  );
}
