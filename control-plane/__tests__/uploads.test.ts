import { parseRecipientUpload } from '@/lib/uploads';

describe('parseRecipientUpload', () => {
  it('parses CSV uploads and counts duplicate recipients for preview UX', async () => {
    const file = {
      name: 'contacts.csv',
      size: 120,
      text: async () => 'phone_number,name\n+251911123456,Abel\n+251911123456,Hanna\n+251922123456,Rahel\n',
    } as unknown as File;

    const result = await parseRecipientUpload(file);

    expect(result.previewRows).toHaveLength(3);
    expect(result.duplicateCount).toBe(1);
    expect(result.previewRows[0]).toEqual({
      phone_number: '+251911123456',
      name: 'Abel',
    });
  });

  it('rejects unsupported file types before upload preview', async () => {
    const file = {
      name: 'notes.txt',
      size: 10,
      text: async () => 'hello',
    } as unknown as File;

    await expect(parseRecipientUpload(file)).rejects.toThrow('Only CSV and Excel files are supported.');
  });
});
