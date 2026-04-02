import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { CreateSenderIdDto } from './dto/create-sender-id.dto';
import { SenderIdsService } from './sender-ids.service';

@ApiTags('sender-ids')
@ApiBearerAuth()
@Controller('sender-ids')
export class SenderIdsController {
  constructor(private readonly senderIdsService: SenderIdsService) {}

  @AuditAction('sender_ids.create')
  @Roles('owner', 'admin', 'developer')
  @Post()
  create(
    @CurrentUser() user: JwtClaims,
    @Body() dto: CreateSenderIdDto,
  ): Promise<Record<string, unknown>> {
    return this.senderIdsService.create(user.tenantId, dto);
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get()
  list(@CurrentUser() user: JwtClaims): Promise<Record<string, unknown>[]> {
    return this.senderIdsService.list(user.tenantId);
  }
}
