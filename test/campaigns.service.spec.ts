import { BadRequestException } from '@nestjs/common';
import { CampaignsService } from '../src/campaigns/campaigns.service';

describe('CampaignsService', () => {
  const buildService = () => new CampaignsService(
    { withTransaction: jest.fn(), query: jest.fn() } as never,
    { write: jest.fn() } as never,
    { hasCapability: jest.fn().mockReturnValue(true) } as never,
  );

  it('requires a contact source when scheduling a campaign', async () => {
    const service = buildService();

    await expect(service.scheduleCampaign('tenant-1', {
      campaignName: 'April Promo',
      startAt: '2026-04-03T08:00:00.000Z',
      templateRef: 'promo@1',
      senderId: 'MYAPP',
    })).rejects.toThrow(BadRequestException);
  });

  it('computes daily cron schedules correctly', () => {
    const service = buildService();
    const nextRun = (service as any).computeNextRunAt('0 8 * * *', 'UTC', new Date('2026-04-02T08:00:00.000Z'), true);
    expect(nextRun.toISOString()).toBe('2026-04-02T08:00:00.000Z');
  });

  it('computes weekly cron schedules correctly', () => {
    const service = buildService();
    const nextRun = (service as any).computeNextRunAt('0 9 * * 1', 'UTC', new Date('2026-04-02T08:00:00.000Z'), true);
    expect(nextRun.toISOString()).toBe('2026-04-06T09:00:00.000Z');
  });

  it('applies tenant timezones when computing cron schedules', () => {
    const service = buildService();
    const nextRun = (service as any).computeNextRunAt('0 8 * * *', 'Africa/Addis_Ababa', new Date('2026-04-02T00:00:00.000Z'), true);
    expect(nextRun.toISOString()).toBe('2026-04-02T05:00:00.000Z');
  });

  it('rejects invalid cron expressions', () => {
    const service = buildService();
    expect(() => (service as any).computeNextRunAt('invalid cron', 'UTC', new Date('2026-04-02T00:00:00.000Z'), true)).toThrow(BadRequestException);
  });

  it('avoids duplicate materialization when scheduler runs repeatedly', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              tenant_id: 'tenant-1',
              campaign_id: 50,
              contact_group_id: null,
              contact_upload_id: 9,
              recurrence_cron: '0 8 * * *',
              timezone: 'UTC',
              next_run_at: '2026-04-02T08:00:00.000Z',
              shard_count: 4,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] }),
    };
    const databaseService = {
      withTransaction: jest
        .fn()
        .mockImplementationOnce(async (callback: (ctx: { client: typeof client }) => Promise<unknown>) => callback({ client }))
        .mockImplementationOnce(async (callback: (ctx: { client: typeof client }) => Promise<unknown>) => callback({ client })),
    };
    const auditService = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new CampaignsService(
      databaseService as never,
      auditService as never,
      { hasCapability: jest.fn().mockReturnValue(true) } as never,
    );

    await service.materializeDueSchedules();
    await service.materializeDueSchedules();

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO campaign_jobs'),
      ['tenant-1', 50, 'upload', 10, 4],
    );
  });
});
