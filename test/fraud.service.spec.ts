import { BadRequestException, HttpException } from '@nestjs/common';
import { FraudService } from '../src/fraud/fraud.service';

describe('FraudService', () => {
  const buildService = (velocityHits: number) => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tenants')) {
        return { rows: [{ priority_tier: 1 }] };
      }

      return {
        rows: [
          {
            id: 1,
            tenant_id: 'tenant-1',
            name: 'block-scam',
            rule_type: 'keyword_block',
            action: 'block',
            values: ['free money'],
            is_active: true,
          },
        ],
      };
    });

    const redisClient = {
      incr: jest.fn().mockResolvedValue(velocityHits),
      expire: jest.fn().mockResolvedValue(1),
    };

    return new FraudService(
      { query } as never,
      {
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        getClient: jest.fn().mockReturnValue(redisClient),
      } as never,
      {
        subscribe: jest.fn().mockResolvedValue(undefined),
        publish: jest.fn().mockResolvedValue(undefined),
      } as never,
      { hasCapability: jest.fn().mockReturnValue(true) } as never,
      { recordRetry: jest.fn() } as never,
    );
  };

  it('blocks content matching blocked keywords', async () => {
    const service = buildService(1);
    await expect(
      service.enforceSubmission({
        tenantId: 'tenant-1',
        phoneNumber: '+251911234567',
        body: 'Claim free money now',
        senderId: 'MYAPP',
        trafficType: 'marketing',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throttles when velocity exceeds threshold', async () => {
    const service = new FraudService(
      {
        query: jest.fn().mockImplementation(async (sql: string) => (
          sql.includes('FROM tenants')
            ? { rows: [{ priority_tier: 2 }] }
            : { rows: [] }
        )),
      } as never,
      {
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        getClient: jest.fn().mockReturnValue({
          incr: jest.fn().mockResolvedValue(6000),
          expire: jest.fn().mockResolvedValue(1),
        }),
      } as never,
      {
        subscribe: jest.fn().mockResolvedValue(undefined),
        publish: jest.fn().mockResolvedValue(undefined),
      } as never,
      { hasCapability: jest.fn().mockReturnValue(true) } as never,
      { recordRetry: jest.fn() } as never,
    );

    await expect(
      service.enforceSubmission({
        tenantId: 'tenant-1',
        phoneNumber: '+251911234567',
        body: 'Normal message',
        senderId: 'MYAPP',
        trafficType: 'transactional',
      }),
    ).rejects.toThrow(HttpException);
  });

  it('blocks low-trust marketing traffic that contains URLs', async () => {
    const service = new FraudService(
      {
        query: jest.fn().mockImplementation(async (sql: string) => (
          sql.includes('FROM tenants')
            ? { rows: [{ priority_tier: 1 }] }
            : { rows: [] }
        )),
      } as never,
      {
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        getClient: jest.fn().mockReturnValue({
          incr: jest.fn().mockResolvedValue(10),
          expire: jest.fn().mockResolvedValue(1),
        }),
      } as never,
      {
        subscribe: jest.fn().mockResolvedValue(undefined),
        publish: jest.fn().mockResolvedValue(undefined),
      } as never,
      { hasCapability: jest.fn().mockReturnValue(true) } as never,
      { recordRetry: jest.fn() } as never,
    );

    await expect(
      service.enforceSubmission({
        tenantId: 'tenant-1',
        phoneNumber: '+251911234567',
        body: 'Visit https://promo.example now',
        senderId: 'MYAPP',
        trafficType: 'marketing',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
