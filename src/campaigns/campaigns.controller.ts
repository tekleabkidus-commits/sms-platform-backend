import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { ReauthGuard } from '../common/guards/reauth.guard';
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
  @Get('campaigns')
  listCampaigns(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.campaignsService.listCampaigns(user.tenantId);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('campaigns/:id')
  getCampaignDetail(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) campaignId: number,
  ): Promise<Record<string, unknown>> {
    return this.campaignsService.getCampaignDetail(user.tenantId, campaignId);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get('campaign-schedules')
  listSchedules(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.campaignsService.listSchedules(user.tenantId);
  }

  @AuditAction('campaign_schedules.pause')
  @Roles('owner', 'admin', 'developer')
  @Post('campaign-schedules/:id/pause')
  pauseSchedule(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) scheduleId: number,
  ): Promise<Record<string, unknown>> {
    return this.campaignsService.setScheduleActive(user.tenantId, scheduleId, false);
  }

  @AuditAction('campaign_schedules.resume')
  @Roles('owner', 'admin', 'developer')
  @Post('campaign-schedules/:id/resume')
  resumeSchedule(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) scheduleId: number,
  ): Promise<Record<string, unknown>> {
    return this.campaignsService.setScheduleActive(user.tenantId, scheduleId, true);
  }

  @AuditAction('campaigns.cancel')
  @Roles('owner', 'admin', 'developer')
  @UseGuards(ReauthGuard)
  @Post('campaigns/:id/cancel')
  cancelCampaign(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) campaignId: number,
  ): Promise<{ success: true }> {
    return this.campaignsService.cancelCampaign(user.tenantId, campaignId);
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
