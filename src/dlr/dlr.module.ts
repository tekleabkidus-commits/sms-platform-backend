import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { DlrController } from './dlr.controller';
import { DlrProcessorService } from './dlr.processor.service';
import { DlrService } from './dlr.service';

@Module({
  imports: [MessagesModule],
  providers: [DlrService, DlrProcessorService],
  controllers: [DlrController],
})
export class DlrModule {}
