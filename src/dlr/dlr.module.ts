import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { OutboxModule } from '../outbox/outbox.module';
import { DlrController } from './dlr.controller';
import { DlrProcessorService } from './dlr.processor.service';
import { DlrService } from './dlr.service';

@Module({
  imports: [MessagesModule, OutboxModule],
  providers: [DlrService, DlrProcessorService],
  controllers: [DlrController],
})
export class DlrModule {}
