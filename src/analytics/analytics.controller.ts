import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Roles('owner', 'admin', 'finance', 'support', 'viewer')
  @Get('sms-summary')
  getSmsSummary(
    @CurrentUser() user: JwtClaims,
    @Query() query: AnalyticsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getSmsSummary(user.tenantId, query.from, query.to);
  }

  @Roles('owner', 'admin', 'support', 'viewer')
  @Get('provider-health')
  getProviderHealth(@Query() query: AnalyticsQueryDto): Promise<Record<string, unknown>[]> {
    return this.analyticsService.getProviderHealth(query.from, query.to);
  }
}
