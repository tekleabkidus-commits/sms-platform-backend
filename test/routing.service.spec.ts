import { RoutingService } from '../src/routing/routing.service';

describe('RoutingService', () => {
  it('prefers healthier SMPP routes for OTP traffic', async () => {
    const databaseService = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              provider_id: 1,
              smpp_config_id: 11,
              preferred_protocol: 'smpp',
              priority: 10,
              weight: 100,
              cost_rank: 50,
              failover_order: 1,
              max_tps: 100,
            },
            {
              id: 2,
              provider_id: 2,
              smpp_config_id: null,
              preferred_protocol: 'http',
              priority: 20,
              weight: 50,
              cost_rank: 10,
              failover_order: 2,
              max_tps: 100,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { provider_id: 1, unit_price_minor: 18 },
            { provider_id: 2, unit_price_minor: 12 },
          ],
        }),
    };
    const redisService = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    const providersService = {
      getProviderMetrics: jest.fn().mockImplementation(async (providerId: number) => ({
        latencyMs: providerId === 1 ? 50 : 400,
        errorRate: providerId === 1 ? 0.01 : 0.2,
        circuitState: 'closed',
      })),
    };

    const service = new RoutingService(
      databaseService as never,
      redisService as never,
      providersService as never,
    );

    const decision = await service.selectRoute('tenant-1', '+251911234567', 'otp');
    expect(decision.providerId).toBe(1);
    expect(decision.protocol).toBe('smpp');
  });
});
