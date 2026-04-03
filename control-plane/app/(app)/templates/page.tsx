'use client';

import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { AppCard, Button, Field, InlineLoader, Input, PageHeader, Select, Textarea, StatusBadge } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { TemplateItem } from '@/lib/api-types';
import { useTemplatesQuery } from '@/lib/hooks';
import { useSessionData } from '@/lib/session-context';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { useUrlFilters } from '@/lib/use-url-filters';
import { formatDateTime } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2),
  body: z.string().min(3),
  isActive: z.enum(['true', 'false']).default('true'),
});

const DEFAULT_FILTERS = {
  search: '',
  status: '',
  page: '1',
  limit: '10',
};

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

function extractMergeFields(body: string): string[] {
  return Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)).map((match) => match[1] ?? '').filter(Boolean);
}

export default function TemplatesPage(): React.ReactElement {
  const session = useSessionData();
  const templates = useTemplatesQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: 'true' },
  });

  useUnsavedChanges(form.formState.isDirty);

  const currentBody = useWatch({ control: form.control, name: 'body' }) ?? '';
  const mergeFields = useMemo(() => extractMergeFields(currentBody), [currentBody]);
  const canEdit = session.user.role === 'owner' || session.user.role === 'admin' || session.user.role === 'developer';
  const canDelete = session.user.role === 'owner' || session.user.role === 'admin';

  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (templates.data ?? []).filter((template) => {
      if (filters.status) {
        const active = filters.status === 'active';
        if (template.isActive !== active) {
          return false;
        }
      }
      if (!search) {
        return true;
      }
      return (
        template.name.toLowerCase().includes(search)
        || template.templateKey.toLowerCase().includes(search)
        || String(template.id) === search
      );
    });
  }, [filters.search, filters.status, templates.data]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const editingTemplate = editingTemplateId ? templates.data?.find((template) => template.id === editingTemplateId) ?? null : null;

  const columns: DataGridColumn<TemplateItem>[] = [
    {
      id: 'template',
      header: 'Template',
      accessor: (row) => row.name,
      cell: (template) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{template.name}</span>
            <CopyButton value={template.templateKey} label="Copy template key" />
          </div>
          <p className="line-clamp-2 max-w-sm text-xs text-slate-500">{template.body}</p>
        </div>
      ),
    },
    {
      id: 'version',
      header: 'Version',
      accessor: (row) => row.version,
      cell: (template) => `v${template.version}`,
    },
    {
      id: 'fields',
      header: 'Fields',
      accessor: (row) => row.mergeFields.join(','),
      cell: (template) => template.mergeFields.join(', ') || '—',
    },
    {
      id: 'created',
      header: 'Created',
      accessor: (row) => row.createdAt,
      cell: (template) => formatDateTime(template.createdAt),
    },
    {
      id: 'active',
      header: 'Active',
      accessor: (row) => row.isActive ? 1 : 0,
      cell: (template) => <StatusBadge value={template.isActive ? 'active' : 'inactive'} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (template) => (
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditingTemplateId(template.id);
                form.reset({
                  name: template.name,
                  body: template.body,
                  isActive: template.isActive ? 'true' : 'false',
                });
              }}
            >
              Edit
            </Button>
          ) : null}
          {canDelete ? (
            <ConfirmButton
              variant="danger"
              title={`Delete ${template.name}`}
              confirmText={`Delete ${template.name}@${template.version}?`}
              onConfirm={async () => {
                await apiRequest(`/templates/${template.id}`, { method: 'DELETE' });
                toast.success('Template deleted.');
                if (editingTemplateId === template.id) {
                  setEditingTemplateId(null);
                  form.reset({ isActive: 'true' });
                }
                await templates.refetch();
              }}
            >
              Delete
            </ConfirmButton>
          ) : null}
        </div>
      ),
    },
  ];

  if (templates.isLoading) {
    return <InlineLoader label="Loading templates" />;
  }

  if (templates.isError || !templates.data) {
    return <ErrorPanel title="Templates unavailable" error={templates.error} onRetry={() => templates.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Templates"
        title="Versioned personalization"
        description="Create, update, and promote personalized message templates without breaking tenant-scoped version history."
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">{editingTemplate ? 'Edit template' : 'Create template'}</h2>
          {canEdit ? (
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                try {
                  const payload = {
                    name: values.name,
                    body: values.body,
                    isActive: values.isActive === 'true',
                  };

                  if (editingTemplate) {
                    await apiRequest(`/templates/${editingTemplate.id}`, {
                      method: 'PUT',
                      body: JSON.stringify(payload),
                    });
                    toast.success('Template version created from edit.');
                  } else {
                    await apiRequest('/templates', {
                      method: 'POST',
                      body: JSON.stringify(payload),
                    });
                    toast.success('Template created.');
                  }

                  setEditingTemplateId(null);
                  form.reset({ isActive: 'true' });
                  await templates.refetch();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Unable to save template');
                }
              })}
            >
              <Field label="Template name" error={form.formState.errors.name?.message}>
                <Input placeholder="otp-login" {...form.register('name')} />
              </Field>
              <Field label="Body" error={form.formState.errors.body?.message}>
                <Textarea rows={6} placeholder="Your OTP is {{code}} and expires in {{minutes}} minutes." {...form.register('body')} />
              </Field>
              <Field label="Active version">
                <Select {...form.register('isActive')}>
                  <option value="true">Set as active</option>
                  <option value="false">Keep inactive</option>
                </Select>
              </Field>
              <AppCard className="bg-slate-50">
                <p className="text-sm font-semibold text-slate-900">Detected merge fields</p>
                <p className="mt-2 text-sm text-slate-600">{mergeFields.length > 0 ? mergeFields.join(', ') : 'No merge fields detected.'}</p>
              </AppCard>
              <div className="flex gap-3">
                <Button type="submit" loading={form.formState.isSubmitting}>
                  {editingTemplate ? 'Publish new version' : 'Save template'}
                </Button>
                {editingTemplate ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingTemplateId(null);
                      form.reset({ isActive: 'true' });
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          ) : (
            <AppCard className="bg-slate-50 text-sm text-slate-600">Your role can review templates but cannot create, edit, or delete them.</AppCard>
          )}
        </AppCard>

        <div className="space-y-4">
          <AppCard className="grid gap-4 md:grid-cols-2">
            <Field label="Search">
              <Input value={filters.search} placeholder="Template name, key, or ID" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
            </Field>
            <Field label="Status">
              <Select value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value, page: '1' })}>
                <option value="">All templates</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </AppCard>

          <DataGrid
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            emptyMessage="No templates matched the current filters."
            pagination={{
              page,
              pageSize,
              total: filteredRows.length,
              onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
              onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
            }}
            visibilityStorageKey="templates-grid-columns"
          />
        </div>
      </div>
    </div>
  );
}
