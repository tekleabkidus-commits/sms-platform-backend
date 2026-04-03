import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditAction } from '../common/decorators/audit.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { TenantScopeQueryDto } from '../common/dto/tenant-scope-query.dto';
import { ReauthGuard } from '../common/guards/reauth.guard';
import { RoutePreviewDto } from './dto/route-preview.dto';
import { UpsertPricingRuleDto } from './dto/upsert-pricing-rule.dto';
import { UpsertRetryPolicyDto } from './dto/upsert-retry-policy.dto';
import { UpsertRoutingRuleDto } from './dto/upsert-routing-rule.dto';
import { RoutingService } from './routing.service';

@ApiTags('routing')
@ApiBearerAuth()
@Controller('routing')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Roles('owner', 'admin', 'developer', 'support')
  @Post('preview')
  preview(@CurrentUser() user: JwtClaims, @Body() dto: RoutePreviewDto): Promise<unknown> {
    return this.routingService.selectRoute(user.tenantId, dto.phoneNumber, dto.trafficType);
  }

  @Roles('admin', 'support')
  @Get('rules')
  listRules(
    @CurrentUser() user: JwtClaims,
    @Query() query: TenantScopeQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.routingService.listRoutingRules(user, query.tenantId);
  }

  @AuditAction('routing_rules.upsert')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Post('rules')
  createRule(
    @CurrentUser() user: JwtClaims,
    @Body() dto: UpsertRoutingRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.routingService.upsertRoutingRule(user, dto);
  }

  @AuditAction('routing_rules.upsert')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Put('rules/:id')
  updateRule(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertRoutingRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.routingService.upsertRoutingRule(user, dto, id);
  }

  @Roles('admin', 'support')
  @Get('pricing-rules')
  listPricingRules(
    @CurrentUser() user: JwtClaims,
    @Query() query: TenantScopeQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.routingService.listPricingRules(user, query.tenantId);
  }

  @AuditAction('pricing_rules.upsert')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Post('pricing-rules')
  createPricingRule(
    @CurrentUser() user: JwtClaims,
    @Body() dto: UpsertPricingRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.routingService.upsertPricingRule(user, dto);
  }

  @AuditAction('pricing_rules.upsert')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Put('pricing-rules/:id')
  updatePricingRule(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertPricingRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.routingService.upsertPricingRule(user, dto, id);
  }

  @Roles('admin', 'support')
  @Get('retry-policies')
  listRetryPolicies(
    @CurrentUser() user: JwtClaims,
    @Query() query: TenantScopeQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.routingService.listRetryPolicies(user, query.tenantId);
  }

  @AuditAction('retry_policies.upsert')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Post('retry-policies')
  createRetryPolicy(
    @CurrentUser() user: JwtClaims,
    @Body() dto: UpsertRetryPolicyDto,
  ): Promise<Record<string, unknown>> {
    return this.routingService.upsertRetryPolicy(user, dto);
  }

  @AuditAction('retry_policies.upsert')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Put('retry-policies/:id')
  updateRetryPolicy(
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertRetryPolicyDto,
  ): Promise<Record<string, unknown>> {
    return this.routingService.upsertRetryPolicy(user, dto, id);
  }
}
