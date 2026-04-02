import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { DlrService } from './dlr.service';

@ApiTags('dlr')
@Controller('providers')
export class DlrController {
  constructor(private readonly dlrService: DlrService) {}

  @Public()
  @Post(':providerCode/dlr')
  receiveWebhook(
    @Param('providerCode') providerCode: string,
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ accepted: true }> {
    return this.dlrService.acceptWebhook(providerCode, payload, headers);
  }
}
