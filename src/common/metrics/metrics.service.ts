import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

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

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
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

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
