import { ForbiddenException } from '@nestjs/common';
import { ComplianceService } from '../src/compliance/compliance.service';

describe('ComplianceService', () => {
  it('blocks destinations present in opt-out or suppression sources', async () => {
    const service = new ComplianceService({
      query: jest.fn().mockResolvedValue({
        rows: [{ phone_number: '+251911234567', is_active: true }],
      }),
    } as never);

    await expect(service.assertNotOptedOut('tenant-1', '0911234567')).rejects.toThrow(ForbiddenException);
  });

  it('creates suppression entries with normalized phone numbers', async () => {
    const service = new ComplianceService({
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 1,
          phone_number: '+251911234567',
          reason: 'manual_block',
          created_at: '2026-04-02T00:00:00.000Z',
        }],
      }),
    } as never);

    await expect(service.createSuppression('tenant-1', '0911234567', 'manual_block')).resolves.toMatchObject({
      phoneNumber: '+251911234567',
      reason: 'manual_block',
    });
  });
});
