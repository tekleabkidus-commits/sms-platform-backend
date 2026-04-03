import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtClaims } from '../auth/auth.types';
import { ReauthGuard } from '../common/guards/reauth.guard';
import { CreateSenderIdDto } from './dto/create-sender-id.dto';
import { ReviewSenderIdDto } from './dto/review-sender-id.dto';
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

  @AuditAction('sender_ids.approve')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number): Promise<Record<string, unknown>> {
    return this.senderIdsService.approve(id);
  }

  @AuditAction('sender_ids.reject')
  @Roles('admin', 'support')
  @UseGuards(ReauthGuard)
  @Post(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSenderIdDto,
  ): Promise<Record<string, unknown>> {
    return this.senderIdsService.reject(id, dto.reason);
  }
}
