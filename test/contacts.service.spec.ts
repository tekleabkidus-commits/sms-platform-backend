import { ContactsService } from '../src/contacts/contacts.service';

describe('ContactsService', () => {
  it('imports inline CSV safely, dedupes rows, and records invalid entries', async () => {
    const txClient = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO contact_uploads')) {
          return { rows: [{ id: 5, created_at: '2026-04-02T00:00:00.000Z' }] };
        }

        if (sql.includes('INSERT INTO contacts')) {
          return { rows: [{ id: 77 }] };
        }

        return { rows: [] };
      }),
    };

    const service = new ContactsService({
      withTransaction: jest.fn().mockImplementation(async (callback: (ctx: { client: typeof txClient }) => Promise<unknown>) => callback({ client: txClient })),
      query: jest.fn(),
    } as never);

    const result = await service.importInlineCsv('tenant-1', {
      fileName: 'contacts.csv',
      csvContent: 'phone_number,name\n0911234567,Abel\n0911234567,Duplicate\ninvalid,Oops',
    });

    expect(result).toMatchObject({
      uploadId: 5,
      validRows: 1,
      invalidRows: 2,
    });
  });
});
