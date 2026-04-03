import { MetricsService } from '../src/common/metrics/metrics.service';

describe('MetricsService', () => {
  it('exposes the expanded operational metrics surface', async () => {
    const service = new MetricsService({
      get: jest.fn().mockImplementation((key: string) => key === 'metrics.defaultMetrics' ? false : undefined),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'app.role') {
          return 'api';
        }
        if (key === 'app.environment') {
          return 'test';
        }
        if (key === 'app.name') {
          return 'sms-platform-backend';
        }
        throw new Error(`Unexpected key ${key}`);
      }),
    } as never);

    service.onModuleInit();
    service.recordAuthEvent('login', 'success');
    service.recordMessageSubmission('api', 'otp', 'accepted');
    service.recordMessageTransition('accepted', 'routed');
    service.setOutboxBacklog('pending', 5);
    service.recordDispatchAttempt(1, 'smpp', 'accepted');
    service.recordDlrEvent('processed', 'delivered');
    service.recordRetry('queued', 'retryable');
    service.setReconciliationBacklog(3);
    service.setProviderCircuitState(1, 'open');
    service.recordProviderError(1, 'smpp', 'timeout');
    service.recordProviderThrottle(1, 'smpp');
    service.recordWalletOperation('reserve', 'success');
    service.setCampaignJobsGauge('running', 4);
    service.recordRateLimitDenied('tenant_api');
    service.setDependencyState('database', true);
    service.setDlrBacklog(9);

    const metrics = await service.getMetrics();
    expect(metrics).toContain('sms_auth_events_total');
    expect(metrics).toContain('sms_message_submissions_total');
    expect(metrics).toContain('sms_outbox_backlog');
    expect(metrics).toContain('sms_provider_circuit_state');
    expect(metrics).toContain('sms_rate_limit_denied_total');
    expect(metrics).toContain('sms_dlr_backlog');
  });
});
