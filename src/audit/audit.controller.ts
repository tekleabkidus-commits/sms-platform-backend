import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtClaims } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit/logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Roles('owner', 'admin', 'finance', 'support', 'viewer')
  @Get()
  listAuditLogs(
    @CurrentUser() user: JwtClaims,
    @Query() query: AuditLogQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.auditService.list(user, query);
  }
}
