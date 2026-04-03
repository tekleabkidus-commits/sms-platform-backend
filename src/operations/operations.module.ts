import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  providers: [OperationsService],
  controllers: [OperationsController],
  exports: [OperationsService],
})
export class OperationsModule {}
