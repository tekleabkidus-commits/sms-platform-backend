import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { CampaignsService } from './campaigns.service';
import { ScheduleCampaignDto } from './dto/schedule-campaign.dto';

@ApiTags('campaigns')
@ApiBearerAuth()
@Controller()
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @AuditAction('campaigns.schedule')
  @Roles('owner', 'admin', 'developer')
  @Post('campaigns/schedule')
  schedule(
    @CurrentUser() user: JwtClaims,
    @Body() dto: ScheduleCampaignDto,
  ): Promise<Record<string, unknown>> {
    return this.campaignsService.scheduleCampaign(user.tenantId, dto);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('campaign-jobs/:id')
  getJob(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) jobId: number,
  ): Promise<Record<string, unknown>> {
    return this.campaignsService.getCampaignJob(user.tenantId, jobId);
  }
}
