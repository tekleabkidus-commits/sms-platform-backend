import { CircuitBreakerService } from '../src/redis/circuit-breaker.service';

describe('CircuitBreakerService', () => {
  const buildService = (rows: unknown[] = []) => {
    const store = new Map<string, unknown>();
    const probeSet = jest
      .fn()
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null);
    const redisService = {
      getJson: jest.fn(async (key: string) => store.get(key) ?? null),
      setJson: jest.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      delete: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      getClient: jest.fn().mockReturnValue({
        set: probeSet,
      }),
    };
    const configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'circuitBreaker.failureThreshold') {
          return 2;
        }
        if (key === 'circuitBreaker.openSeconds') {
          return 5;
        }
        return 2;
      }),
    };
    const databaseService = {
      query: jest.fn().mockResolvedValue({ rows }),
    };

    return {
      service: new CircuitBreakerService(
        databaseService as never,
        redisService as never,
        configService as never,
        { setProviderCircuitState: jest.fn() } as never,
      ),
      probeSet,
      redisService,
      databaseService,
      store,
    };
  };

  it('opens after the failure threshold and allows only one half-open probe', async () => {
    const { service, probeSet } = buildService();

    await service.registerFailure(10, 'timeout');
    const openSnapshot = await service.registerFailure(10, 'timeout');
    expect(openSnapshot.state).toBe('open');

    await service.setState(10, 'open', 0, 'retry');
    await expect(service.allowDispatch(10)).resolves.toBe(true);
    await expect(service.allowDispatch(10)).resolves.toBe(false);
    expect(probeSet).toHaveBeenCalled();

    await service.registerSuccess(10);
    await expect(service.allowDispatch(10)).resolves.toBe(true);
  });

  it('hydrates Redis from PostgreSQL on startup when Redis is empty', async () => {
    const { service, redisService } = buildService([
      {
        provider_id: 11,
        state: 'open',
        failure_count: 4,
        success_count: 0,
        opened_reason: 'timeout',
        last_changed: '2026-04-02T00:00:00.000Z',
        next_probe_at: '2026-04-02T00:01:00.000Z',
      },
    ]);

    await service.onModuleInit();
    expect(redisService.setJson).toHaveBeenCalledWith(
      'circuit:provider:11',
      expect.objectContaining({ state: 'open', failureCount: 4 }),
      expect.any(Number),
    );
  });

  it('does not overwrite fresher Redis circuit state during warm start', async () => {
    const { service, redisService, store } = buildService([
      {
        provider_id: 11,
        state: 'open',
        failure_count: 4,
        success_count: 0,
        opened_reason: 'timeout',
        last_changed: '2026-04-02T00:00:00.000Z',
        next_probe_at: '2026-04-02T00:01:00.000Z',
      },
    ]);
    store.set('circuit:provider:11', {
      state: 'half_open',
      failureCount: 1,
      successCount: 0,
      lastChangedAt: '2026-04-02T00:05:00.000Z',
      nextProbeAt: '2026-04-02T00:06:00.000Z',
      lastReason: 'probe',
    });

    await service.onModuleInit();
    expect(redisService.setJson).not.toHaveBeenCalledWith(
      'circuit:provider:11',
      expect.objectContaining({ state: 'open' }),
      expect.any(Number),
    );
  });
});
