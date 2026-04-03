'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/ui/copy-button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { AppCard, Button, Field, InlineLoader, Input, PageHeader, Select } from '@/components/ui/primitives';
import { apiRequest } from '@/lib/api';
import { useContactGroupsQuery, useContactUploadsQuery } from '@/lib/hooks';
import { parseRecipientUpload, type UploadPreviewRow } from '@/lib/uploads';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { useUrlFilters } from '@/lib/use-url-filters';
import { ContactUpload } from '@/lib/api-types';
import { formatDateTime } from '@/lib/utils';

const DEFAULT_FILTERS = {
  search: '',
  status: '',
  page: '1',
  limit: '10',
};

export default function ContactUploadsPage(): React.ReactElement {
  const uploads = useContactUploadsQuery();
  const groups = useContactGroupsQuery();
  const { filters, updateFilters, applyFilters } = useUrlFilters(DEFAULT_FILTERS);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [preview, setPreview] = useState<{ csvContent: string; previewRows: UploadPreviewRow[]; duplicateCount: number; fileName: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useUnsavedChanges(Boolean(preview));

  const filteredUploads = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (uploads.data ?? []).filter((upload) => {
      if (filters.status && upload.status !== filters.status) {
        return false;
      }
      if (!search) {
        return true;
      }
      return upload.originalFileName.toLowerCase().includes(search) || String(upload.id) === search;
    });
  }, [filters.search, filters.status, uploads.data]);

  const page = Number(filters.page);
  const pageSize = Number(filters.limit);
  const rows = filteredUploads.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataGridColumn<ContactUpload>[] = [
    {
      id: 'file',
      header: 'File',
      accessor: (row) => row.originalFileName,
      cell: (upload) => (
        <div className="space-y-1">
          <p className="font-medium text-slate-900">{upload.originalFileName}</p>
          <div className="flex gap-3 text-xs">
            <Link href={`/contacts/uploads/${upload.id}`} className="text-teal-700 hover:text-teal-600">View invalid rows</Link>
            <span>Upload #{upload.id}</span>
            <CopyButton value={String(upload.id)} label="Copy upload ID" />
          </div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', accessor: (row) => row.status, cell: (upload) => upload.status },
    { id: 'rows', header: 'Rows', accessor: (row) => row.totalRows, cell: (upload) => `${upload.validRows}/${upload.totalRows} valid` },
    { id: 'group', header: 'Target group', accessor: (row) => row.targetGroupId ?? 0, cell: (upload) => upload.targetGroupId ? `Group #${upload.targetGroupId}` : 'None' },
    { id: 'completed', header: 'Completed', accessor: (row) => row.completedAt ?? row.createdAt, cell: (upload) => formatDateTime(upload.completedAt ?? upload.createdAt) },
  ];

  if (uploads.isLoading || groups.isLoading) {
    return <InlineLoader label="Loading upload history" />;
  }

  if (uploads.isError || !uploads.data) {
    return <ErrorPanel title="Uploads unavailable" error={uploads.error} onRetry={() => uploads.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Upload history"
        title="CSV and Excel ingestion"
        description="Review upload progress, invalid rows, target group assignment, and import a fresh contacts file with validation preview before commit."
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <AppCard className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">Import contacts</h2>
          <Field label="Target group">
            <Select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
              <option value="">No group assignment</option>
              {groups.data?.map((group) => (
                <option key={group.id} value={String(group.id)}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Recipient file" hint="CSV, XLSX, or XLS up to 10 MB.">
            <Input
              type="file"
              aria-label="Contact import file"
              accept=".csv,.xlsx,.xls"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setPreview(null);
                  return;
                }
                try {
                  const parsed = await parseRecipientUpload(file);
                  setPreview({ ...parsed, fileName: file.name });
                  toast.success(`Prepared preview for ${file.name}.`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Unable to parse upload');
                }
              }}
            />
          </Field>
          {preview ? (
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{preview.fileName}</p>
                <p className="text-xs text-slate-500">
                  {preview.previewRows.length} preview rows • {preview.duplicateCount} duplicate values detected before upload
                </p>
              </div>
              <pre className="overflow-auto rounded-2xl bg-white p-3 text-xs text-slate-700">{JSON.stringify(preview.previewRows, null, 2)}</pre>
              <div className="flex gap-3">
                <Button
                  type="button"
                  loading={submitting}
                  onClick={async () => {
                    if (!preview) {
                      return;
                    }
                    setSubmitting(true);
                    try {
                      const result = await apiRequest<{ uploadId: number; invalidRows: number }>('/contact-uploads/inline', {
                        method: 'POST',
                        body: JSON.stringify({
                          csvContent: preview.csvContent,
                          fileName: preview.fileName,
                          targetGroupId: selectedGroupId ? Number(selectedGroupId) : undefined,
                        }),
                      });
                      toast.success(`Upload ${result.uploadId} accepted with ${result.invalidRows} invalid rows.`);
                      setPreview(null);
                      await uploads.refetch();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Unable to import contacts');
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  Commit import
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
                  Clear preview
                </Button>
              </div>
            </div>
          ) : null}
        </AppCard>

        <div className="space-y-4">
          <AppCard className="grid gap-4 md:grid-cols-2">
            <Field label="Search">
              <Input value={filters.search} placeholder="File name or upload ID" onChange={(event) => updateFilters({ search: event.target.value, page: '1' }, { apply: true })} />
            </Field>
            <Field label="Status">
              <Select value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value, page: '1' })}>
                <option value="">All statuses</option>
                <option value="uploaded">Uploaded</option>
                <option value="importing">Importing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </Select>
            </Field>
          </AppCard>

          <DataGrid
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            emptyMessage="No uploads matched the current filters."
            pagination={{
              page,
              pageSize,
              total: filteredUploads.length,
              onPageChange: (nextPage) => applyFilters({ ...filters, page: String(nextPage) }),
              onPageSizeChange: (nextPageSize) => applyFilters({ ...filters, page: '1', limit: String(nextPageSize) }),
            }}
            visibilityStorageKey="contact-uploads-grid-columns"
          />
        </div>
      </div>
    </div>
  );
}
