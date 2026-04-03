import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuditAction } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { JwtClaims } from '../auth/auth.types';
import { MessageExplorerQueryDto } from './dto/message-explorer-query.dto';
import { SubmitMessageDto } from './dto/submit-message.dto';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@ApiSecurity('apiKey')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @UseGuards(ApiKeyGuard)
  @AuditAction('messages.submit')
  @Post()
  @ApiOperation({ summary: 'Submit a single SMS using raw text or a template reference' })
  @ApiOkResponse({
    example: {
      id: 1001,
      submitDate: '2026-04-02',
      tenantId: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799',
      status: 'accepted',
      body: 'Your OTP is 815204 and expires in 5 minutes.',
      routePreview: {
        providerId: 1,
        protocol: 'smpp',
        estimatedUnitCostMinor: 18,
      },
    },
  })
  submit(@Req() request: Request, @Body() dto: SubmitMessageDto): Promise<Record<string, unknown>> {
    return this.messagesService.submitMessage(request, dto);
  }

  @AuditAction('messages.submit.control_plane')
  @Roles('owner', 'admin', 'developer', 'support')
  @Post('control-plane')
  @ApiOperation({ summary: 'Submit a single SMS from the authenticated control plane' })
  submitFromControlPlane(
    @CurrentUser() user: JwtClaims,
    @Req() request: Request,
    @Body() dto: SubmitMessageDto,
  ): Promise<Record<string, unknown>> {
    return this.messagesService.submitControlPlaneMessage(
      user,
      dto,
      request.headers['x-request-id']?.toString() ?? null,
      request.headers['x-idempotency-key']?.toString() ?? null,
    );
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get()
  @ApiOperation({ summary: 'Search tenant messages with explorer filters' })
  listMessages(
    @CurrentUser() user: JwtClaims,
    @Query() query: MessageExplorerQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.messagesService.listMessages(user, query);
  }

  @Get(':submitDate/:tenantId/:id')
  getMessage(
    @Param('submitDate') submitDate: string,
    @Param('tenantId') tenantId: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Record<string, unknown>> {
    return this.messagesService.getMessage({ submitDate, tenantId, id });
  }

  @Roles('owner', 'admin', 'developer', 'support', 'viewer')
  @Get(':submitDate/:tenantId/:id/trace')
  @ApiOperation({ summary: 'Resolve full message trace, logs, billing, and DLR history' })
  getTrace(
    @CurrentUser() user: JwtClaims,
    @Param('submitDate') submitDate: string,
    @Param('tenantId') tenantId: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Record<string, unknown>> {
    return this.messagesService.getMessageTrace(user, { submitDate, tenantId, id });
  }
}
