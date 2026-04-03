import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { OperationalMetricsService } from '../common/metrics/operational-metrics.service';

@Module({
  providers: [HealthService, OperationalMetricsService],
  controllers: [HealthController],
})
export class HealthModule {}
