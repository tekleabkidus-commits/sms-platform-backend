import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { CreateFraudRuleDto } from './dto/create-fraud-rule.dto';
import { FraudService } from './fraud.service';

@ApiTags('fraud')
@ApiBearerAuth()
@Controller('fraud')
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @AuditAction('fraud_rules.create')
  @Roles('owner', 'admin')
  @Post('rules')
  createRule(
    @CurrentUser() user: JwtClaims,
    @Body() dto: CreateFraudRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.fraudService.createRule(user.tenantId, dto);
  }

  @Roles('owner', 'admin', 'support')
  @Get('rules')
  listRules(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.fraudService.listRules(user.tenantId);
  }
}
