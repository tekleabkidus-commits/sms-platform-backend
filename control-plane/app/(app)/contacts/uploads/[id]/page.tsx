'use client';

import { use } from 'react';
import { toast } from 'sonner';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { ErrorPanel } from '@/components/ui/error-panel';
import { AppCard, Button, PageHeader } from '@/components/ui/primitives';
import { downloadCsv } from '@/lib/csv';
import { useContactUploadErrorsQuery } from '@/lib/hooks';
import { ContactUploadError } from '@/lib/api-types';
import { formatDateTime } from '@/lib/utils';

export default function ContactUploadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const resolvedParams = use(params);
  const errors = useContactUploadErrorsQuery(Number(resolvedParams.id));

  const columns: DataGridColumn<ContactUploadError>[] = [
    { id: 'rowNumber', header: 'Row', accessor: (row) => row.rowNumber, cell: (row) => String(row.rowNumber) },
    { id: 'reason', header: 'Reason', accessor: (row) => row.errorReason, cell: (row) => row.errorReason },
    {
      id: 'rawRecord',
      header: 'Raw record',
      accessor: (row) => JSON.stringify(row.rawRecord),
      cell: (row) => (
        <pre className="max-w-xl overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">
          {JSON.stringify(row.rawRecord, null, 2)}
        </pre>
      ),
    },
    { id: 'createdAt', header: 'Created', accessor: (row) => row.createdAt, cell: (row) => formatDateTime(row.createdAt) },
  ];

  if (errors.isError) {
    return <ErrorPanel title="Upload detail unavailable" error={errors.error} onRetry={() => errors.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Upload detail"
        title={`Upload #${resolvedParams.id}`}
        description="Inspect invalid or rejected records produced during contact ingestion."
        actions={(
          <Button
            type="button"
            variant="ghost"
            disabled={!errors.data?.length}
            onClick={() => {
              downloadCsv({
                filename: `upload-${resolvedParams.id}-errors.csv`,
                columns: [
                  { header: 'Row Number', value: (row) => row.rowNumber },
                  { header: 'Error Reason', value: (row) => row.errorReason },
                  { header: 'Raw Record', value: (row) => JSON.stringify(row.rawRecord) },
                  { header: 'Created At', value: (row) => row.createdAt },
                ],
                rows: (errors.data ?? []) as unknown as Record<string, unknown>[],
              });
              toast.success('Invalid-row report downloaded.');
            }}
          >
            Download invalid rows
          </Button>
        )}
      />

      <AppCard>
        <DataGrid
          columns={columns}
          data={errors.data ?? []}
          getRowId={(row) => row.id}
          emptyMessage="No invalid rows were recorded for this upload."
          loading={errors.isLoading}
        />
      </AppCard>
    </div>
  );
}
