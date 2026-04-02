import { Global, Module } from '@nestjs/common';
import { HttpProviderService } from './http-provider.service';
import { SmppConnectorService } from './smpp.service';

@Global()
@Module({
  providers: [HttpProviderService, SmppConnectorService],
  exports: [HttpProviderService, SmppConnectorService],
})
export class ConnectorsModule {}
