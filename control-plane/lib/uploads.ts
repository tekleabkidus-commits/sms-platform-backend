'use client';

export type UploadPreviewRow = Record<string, string>;

export async function parseRecipientUpload(file: File): Promise<{
  csvContent: string;
  previewRows: UploadPreviewRow[];
  duplicateCount: number;
}> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['csv', 'xlsx', 'xls'].includes(extension)) {
    throw new Error('Only CSV and Excel files are supported.');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Upload files must be 10 MB or smaller.');
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
      if (phone && seen.has(phone)) {
        duplicateCount += 1;
      }
      seen.add(phone);
    }
    return { csvContent: text, previewRows, duplicateCount };
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
      if (phone && seen.has(phone)) {
        duplicateCount += 1;
      }
      seen.add(phone);
    }
  }
  return { csvContent, previewRows, duplicateCount };
}
