import { Global, Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { MetricsService } from '../common/metrics/metrics.service';

@Global()
@Module({
  providers: [KafkaService, MetricsService],
  exports: [KafkaService, MetricsService],
})
export class KafkaModule {}
