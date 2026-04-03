import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SenderIdsService } from './sender-ids.service';
import { SenderIdsController } from './sender-ids.controller';

@Module({
  imports: [AuthModule],
  providers: [SenderIdsService],
  controllers: [SenderIdsController],
  exports: [SenderIdsService],
})
export class SenderIdsModule {}
