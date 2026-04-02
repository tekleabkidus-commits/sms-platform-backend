import { Controller, Get } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from '../common/metrics/metrics.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @ApiProduces('text/plain')
  @Get('metrics')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
