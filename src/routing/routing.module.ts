import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProvidersModule } from '../providers/providers.module';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

@Module({
  imports: [AuthModule, ProvidersModule],
  providers: [RoutingService],
  controllers: [RoutingController],
  exports: [RoutingService],
})
export class RoutingModule {}
