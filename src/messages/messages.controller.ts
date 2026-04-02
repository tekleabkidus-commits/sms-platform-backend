import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
import { ApiKeyGuard } from '../common/guards/api-key.guard';
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

  @Get(':submitDate/:tenantId/:id')
  getMessage(
    @Param('submitDate') submitDate: string,
    @Param('tenantId') tenantId: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Record<string, unknown>> {
    return this.messagesService.getMessage({ submitDate, tenantId, id });
  }
}
