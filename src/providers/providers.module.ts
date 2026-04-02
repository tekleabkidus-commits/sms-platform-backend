import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ProvidersService } from './providers.service';

@Module({
  imports: [ConnectorsModule],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
