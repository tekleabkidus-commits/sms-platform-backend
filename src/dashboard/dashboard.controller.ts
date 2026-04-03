import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtClaims } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantScopeQueryDto } from '../common/dto/tenant-scope-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles('owner', 'admin', 'finance', 'support', 'developer', 'viewer')
  @Get('tenant')
  getTenantDashboard(
    @CurrentUser() user: JwtClaims,
    @Query() query: TenantScopeQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.dashboardService.getTenantDashboard(user, query.tenantId);
  }
}
