'use client';

function escapeCell(value: unknown): string {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

export function downloadCsv(input: {
  filename: string;
  columns: Array<{ header: string; value: (row: Record<string, unknown>) => unknown }>;
  rows: Record<string, unknown>[];
}): void {
  const headerLine = input.columns.map((column) => escapeCell(column.header)).join(',');
  const rowLines = input.rows.map((row) => input.columns.map((column) => escapeCell(column.value(row))).join(','));
  const blob = new Blob([[headerLine, ...rowLines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
