import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtClaims } from '../auth/auth.types';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ComplianceService } from './compliance.service';
import { CreateOptOutDto } from './dto/create-opt-out.dto';

@ApiTags('compliance')
@ApiBearerAuth()
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @AuditAction('compliance.opt_outs.create')
  @Roles('owner', 'admin', 'support')
  @Post('opt-outs')
  createOptOut(
    @CurrentUser() user: JwtClaims,
    @Body() dto: CreateOptOutDto,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.createOptOut(user.tenantId, dto.phoneNumber, dto.reason);
  }

  @Roles('owner', 'admin', 'support', 'viewer')
  @Get('opt-outs')
  listOptOuts(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.complianceService.listOptOuts(user.tenantId);
  }

  @AuditAction('compliance.suppressions.create')
  @Roles('owner', 'admin', 'support')
  @Post('suppressions')
  createSuppression(
    @CurrentUser() user: JwtClaims,
    @Body() dto: CreateOptOutDto,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.createSuppression(user.tenantId, dto.phoneNumber, dto.reason);
  }

  @Roles('owner', 'admin', 'support', 'viewer')
  @Get('suppressions')
  listSuppressions(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.complianceService.listSuppressions(user.tenantId);
  }
}
