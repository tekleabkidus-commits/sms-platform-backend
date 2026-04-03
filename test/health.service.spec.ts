import { HealthService } from '../src/health/health.service';

describe('HealthService', () => {
  const buildService = (overrides: {
    dbFails?: boolean;
    redisFails?: boolean;
    producerConnected?: boolean;
    connectedConsumers?: number;
    role?: string;
  } = {}) => {
    const metricsService = {
      setDependencyState: jest.fn(),
    };

    const service = new HealthService(
      {
        ping: overrides.dbFails
          ? jest.fn().mockRejectedValue(new Error('db down'))
          : jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        ping: overrides.redisFails
          ? jest.fn().mockRejectedValue(new Error('redis down'))
          : jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        getHealth: jest.fn().mockReturnValue({
          producerConnected: overrides.producerConnected ?? true,
          connectedConsumers: overrides.connectedConsumers ?? 1,
          totalConsumers: overrides.connectedConsumers ?? 1,
          shuttingDown: false,
        }),
      } as never,
      {
        getRole: jest.fn().mockReturnValue(overrides.role ?? 'worker-dispatch'),
        getEnvironment: jest.fn().mockReturnValue('test'),
        describeCapabilities: jest.fn().mockReturnValue(['messageWorkflow']),
      } as never,
      metricsService as never,
    );

    return { service, metricsService };
  };

  it('reports ready when dependencies are healthy', async () => {
    const { service, metricsService } = buildService();

    const readiness = await service.getReadiness();
    expect(readiness.ready).toBe(true);
    expect(metricsService.setDependencyState).toHaveBeenCalledWith('database', true);
    expect(metricsService.setDependencyState).toHaveBeenCalledWith('redis', true);
    expect(metricsService.setDependencyState).toHaveBeenCalledWith('kafka', true);
  });

  it('reports degraded when worker consumers are not connected', async () => {
    const { service } = buildService({
      role: 'worker-dlr',
      connectedConsumers: 0,
    });

    const readiness = await service.getReadiness() as any;
    expect(readiness.ready).toBe(false);
    expect(readiness.dependencies.kafka.state).toBe('down');
  });

  it('reports degraded when database probe fails', async () => {
    const { service } = buildService({ dbFails: true });

    const readiness = await service.getReadiness() as any;
    expect(readiness.ready).toBe(false);
    expect(readiness.dependencies.database.state).toBe('down');
  });
});
