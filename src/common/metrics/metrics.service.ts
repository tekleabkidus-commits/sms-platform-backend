import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();
  private readonly httpRequestsCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests handled',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });
  private readonly httpLatencyHistogram = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP latency histogram',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [this.registry],
  });
  private readonly kafkaMessagesCounter = new Counter({
    name: 'kafka_messages_total',
    help: 'Kafka messages produced and consumed',
    labelNames: ['topic', 'direction', 'status'],
    registers: [this.registry],
  });
  private readonly authEventsCounter = new Counter({
    name: 'sms_auth_events_total',
    help: 'Authentication outcomes',
    labelNames: ['action', 'outcome'],
    registers: [this.registry],
  });
  private readonly messageSubmissionsCounter = new Counter({
    name: 'sms_message_submissions_total',
    help: 'Accepted or rejected message submissions',
    labelNames: ['source', 'traffic_type', 'outcome'],
    registers: [this.registry],
  });
  private readonly messageTransitionsCounter = new Counter({
    name: 'sms_message_transitions_total',
    help: 'Message lifecycle transitions',
    labelNames: ['from_status', 'to_status'],
    registers: [this.registry],
  });
  private readonly outboxBacklogGauge = new Gauge({
    name: 'sms_outbox_backlog',
    help: 'Outbox backlog by status',
    labelNames: ['status'],
    registers: [this.registry],
  });
  private readonly dispatchAttemptsCounter = new Counter({
    name: 'sms_dispatch_attempts_total',
    help: 'Dispatch attempts by provider and protocol',
    labelNames: ['provider', 'protocol', 'outcome'],
    registers: [this.registry],
  });
  private readonly dlrEventsCounter = new Counter({
    name: 'sms_dlr_events_total',
    help: 'DLR processing outcomes',
    labelNames: ['outcome', 'status'],
    registers: [this.registry],
  });
  private readonly retryEventsCounter = new Counter({
    name: 'sms_retry_events_total',
    help: 'Retry outcomes by reason',
    labelNames: ['outcome', 'reason'],
    registers: [this.registry],
  });
  private readonly reconciliationBacklogGauge = new Gauge({
    name: 'sms_reconciliation_backlog',
    help: 'Pending reconciliation events',
    registers: [this.registry],
  });
  private readonly providerCircuitGauge = new Gauge({
    name: 'sms_provider_circuit_state',
    help: 'Provider circuit state',
    labelNames: ['provider', 'state'],
    registers: [this.registry],
  });
  private readonly providerErrorsCounter = new Counter({
    name: 'sms_provider_errors_total',
    help: 'Provider errors by code',
    labelNames: ['provider', 'protocol', 'error_code'],
    registers: [this.registry],
  });
  private readonly providerThrottleCounter = new Counter({
    name: 'sms_provider_throttle_total',
    help: 'Provider throttle events',
    labelNames: ['provider', 'protocol'],
    registers: [this.registry],
  });
  private readonly walletOperationsCounter = new Counter({
    name: 'sms_wallet_operations_total',
    help: 'Wallet operations by outcome',
    labelNames: ['operation', 'outcome'],
    registers: [this.registry],
  });
  private readonly campaignJobsGauge = new Gauge({
    name: 'sms_campaign_jobs',
    help: 'Campaign jobs by status',
    labelNames: ['status'],
    registers: [this.registry],
  });
  private readonly rateLimitDeniedCounter = new Counter({
    name: 'sms_rate_limit_denied_total',
    help: 'Rate limit denials by scope',
    labelNames: ['scope'],
    registers: [this.registry],
  });
  private readonly dependencyStateGauge = new Gauge({
    name: 'sms_dependency_state',
    help: 'Dependency state (1=up,0=down)',
    labelNames: ['dependency'],
    registers: [this.registry],
  });
  private readonly dlrBacklogGauge = new Gauge({
    name: 'sms_dlr_backlog',
    help: 'Pending DLR backlog',
    registers: [this.registry],
  });

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.registry.setDefaultLabels({
      app_role: this.configService.getOrThrow<string>('app.role'),
      environment: this.configService.getOrThrow<string>('app.environment'),
      service: this.configService.getOrThrow<string>('app.name'),
    });

    if (this.configService.get<boolean>('metrics.defaultMetrics')) {
      collectDefaultMetrics({ register: this.registry });
    }
  }

  recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequestsCounter.inc(labels);
    this.httpLatencyHistogram.observe(labels, durationMs / 1000);
  }

  recordKafkaMessage(topic: string, direction: 'produce' | 'consume', status: 'success' | 'error'): void {
    this.kafkaMessagesCounter.inc({ topic, direction, status });
  }

  recordAuthEvent(action: 'login' | 'reauth' | 'api_key_auth', outcome: 'success' | 'failure'): void {
    this.authEventsCounter.inc({ action, outcome });
  }

  recordMessageSubmission(source: 'api' | 'control_plane', trafficType: string, outcome: 'accepted' | 'rejected'): void {
    this.messageSubmissionsCounter.inc({ source, traffic_type: trafficType, outcome });
  }

  recordMessageTransition(fromStatus: string, toStatus: string): void {
    this.messageTransitionsCounter.inc({ from_status: fromStatus, to_status: toStatus });
  }

  setOutboxBacklog(status: 'pending' | 'failed', value: number): void {
    this.outboxBacklogGauge.set({ status }, value);
  }

  recordDispatchAttempt(provider: string | number, protocol: string, outcome: 'accepted' | 'failed' | 'uncertain'): void {
    this.dispatchAttemptsCounter.inc({ provider: String(provider), protocol, outcome });
  }

  recordDlrEvent(outcome: 'processed' | 'reconciled' | 'duplicate' | 'invalid', status: string): void {
    this.dlrEventsCounter.inc({ outcome, status });
  }

  recordRetry(outcome: 'queued' | 'skipped' | 'failed', reason: string): void {
    this.retryEventsCounter.inc({ outcome, reason });
  }

  setReconciliationBacklog(value: number): void {
    this.reconciliationBacklogGauge.set(value);
  }

  setProviderCircuitState(providerId: number, state: 'closed' | 'open' | 'half_open'): void {
    for (const candidate of ['closed', 'open', 'half_open']) {
      this.providerCircuitGauge.set({ provider: String(providerId), state: candidate }, candidate === state ? 1 : 0);
    }
  }

  recordProviderError(providerId: number, protocol: string, errorCode: string): void {
    this.providerErrorsCounter.inc({
      provider: String(providerId),
      protocol,
      error_code: errorCode || 'unknown',
    });
  }

  recordProviderThrottle(providerId: number, protocol: string): void {
    this.providerThrottleCounter.inc({ provider: String(providerId), protocol });
  }

  recordWalletOperation(operation: 'reserve' | 'debit' | 'release' | 'refund', outcome: 'success' | 'duplicate'): void {
    this.walletOperationsCounter.inc({ operation, outcome });
  }

  setCampaignJobsGauge(status: 'running' | 'failed', value: number): void {
    this.campaignJobsGauge.set({ status }, value);
  }

  recordRateLimitDenied(scope: string): void {
    this.rateLimitDeniedCounter.inc({ scope });
  }

  setDependencyState(dependency: 'database' | 'redis' | 'kafka', up: boolean): void {
    this.dependencyStateGauge.set({ dependency }, up ? 1 : 0);
  }

  setDlrBacklog(value: number): void {
    this.dlrBacklogGauge.set(value);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
