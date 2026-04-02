import { Module } from '@nestjs/common';
import { SenderIdsService } from './sender-ids.service';
import { SenderIdsController } from './sender-ids.controller';

@Module({
  providers: [SenderIdsService],
  controllers: [SenderIdsController],
  exports: [SenderIdsService],
})
export class SenderIdsModule {}
