import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { FraudModule } from '../fraud/fraud.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ProvidersModule } from '../providers/providers.module';
import { RoutingModule } from '../routing/routing.module';
import { SenderIdsModule } from '../sender-ids/sender-ids.module';
import { TemplatesModule } from '../templates/templates.module';
import { MessagesController } from './messages.controller';
import { MessageWorkflowService } from './message-workflow.service';
import { MessagesService } from './messages.service';

@Module({
  imports: [
    TemplatesModule,
    RoutingModule,
    SenderIdsModule,
    FraudModule,
    OutboxModule,
    ProvidersModule,
    ConnectorsModule,
  ],
  providers: [MessagesService, MessageWorkflowService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
