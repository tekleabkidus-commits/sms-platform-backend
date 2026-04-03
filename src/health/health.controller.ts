import { Controller, Get } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from '../common/metrics/metrics.service';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly healthService: HealthService,
  ) {}

  @Public()
  @Get('health')
  getHealth(): Promise<Record<string, unknown>> {
    return this.healthService.getReadiness();
  }

  @Public()
  @Get('health/live')
  getLiveness(): Record<string, unknown> {
    return this.healthService.getLiveness();
  }

  @Public()
  @Get('health/ready')
  getReadiness(): Promise<Record<string, unknown>> {
    return this.healthService.getReadiness();
  }

  @Public()
  @Get('health/startup')
  getStartup(): Record<string, unknown> {
    return this.healthService.getLiveness();
  }

  @Public()
  @ApiProduces('text/plain')
  @Get('metrics')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
