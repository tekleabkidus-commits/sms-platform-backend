import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopics } from '../kafka/kafka-topics';
import { HttpProviderService, DispatchResult } from '../connectors/http-provider.service';
import { SmppConnectorService } from '../connectors/smpp.service';
import { ProvidersService } from '../providers/providers.service';
import { RoutingService } from '../routing/routing.service';
import { FraudService } from '../fraud/fraud.service';
import { OutboxService } from '../outbox/outbox.service';
import { MessageCompositeId } from './messages.types';
import { MessagesService } from './messages.service';

interface MessageEventPayload {
  submitDate: string;
  tenantId: string;
  messageId: number;
  version: number;
  phoneNumber: string;
  body: string;
  senderId: string;
  trafficType: string;
  providerId?: number;
  providerMessageId?: string;
  accepted?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class MessageWorkflowService implements OnModuleInit {
  private readonly logger = new Logger(MessageWorkflowService.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly databaseService: DatabaseService,
    private readonly messagesService: MessagesService,
    private readonly routingService: RoutingService,
    private readonly providersService: ProvidersService,
    private readonly fraudService: FraudService,
    private readonly outboxService: OutboxService,
    private readonly httpProviderService: HttpProviderService,
    private readonly smppConnectorService: SmppConnectorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.kafkaService.subscribe(KafkaTopics.SmsAccepted, 'messages-accepted', async ({ value }) => {
        await this.handleAccepted(JSON.parse(value) as MessageEventPayload);
      }),
      this.kafkaService.subscribe(KafkaTopics.SmsDispatchRealtime, 'messages-dispatch-realtime', async ({ value }) => {
        await this.handleDispatch(JSON.parse(value) as MessageEventPayload);
      }),
      this.kafkaService.subscribe(KafkaTopics.SmsDispatchBulk, 'messages-dispatch-bulk', async ({ value }) => {
        await this.handleDispatch(JSON.parse(value) as MessageEventPayload);
      }),
      this.kafkaService.subscribe(KafkaTopics.SmsRetry, 'messages-retry', async ({ value }) => {
        await this.handleRetry(JSON.parse(value) as MessageEventPayload);
      }),
      this.kafkaService.subscribe(KafkaTopics.SmsDispatchResults, 'messages-dispatch-results', async ({ value }) => {
        await this.handleDispatchResult(JSON.parse(value) as MessageEventPayload);
      }),
    ]);
  }

  private toComposite(payload: MessageEventPayload): MessageCompositeId {
    return {
      submitDate: payload.submitDate,
      tenantId: payload.tenantId,
      id: payload.messageId,
    };
  }

  private dispatchTopicFor(trafficType: string): string {
    return trafficType === 'marketing' ? KafkaTopics.SmsDispatchBulk : KafkaTopics.SmsDispatchRealtime;
  }

  private async handleAccepted(payload: MessageEventPayload): Promise<void> {
    const composite = this.toComposite(payload);
    const message = await this.messagesService.getMessageRow(composite);
    if (message.status !== 'accepted') {
      return;
    }

    const route = await this.routingService.selectRoute(message.tenant_id, message.phone_number, message.traffic_type);
    await this.databaseService.withTransaction(async (tx) => {
      const updated = await this.messagesService.transitionMessage(tx, message, 'routed', {
        provider_id: route.providerId,
        smpp_config_id: route.smppConfigId,
        route_rule_id: route.routingRuleId,
        cost_minor: route.estimatedUnitCostMinor,
        last_error_code: null,
        last_error_message: null,
      });

      await this.messagesService.logEvent(
        tx,
        composite,
        'routed',
        'accepted',
        'routed',
        { route },
        route.providerId,
        null,
        updated.attempt_count,
      );

      await this.outboxService.enqueue({
        tenantId: message.tenant_id,
        aggregateType: 'message',
        aggregateId: `${payload.submitDate}:${payload.tenantId}:${payload.messageId}`,
        eventType: 'message.dispatch',
        topicName: this.dispatchTopicFor(message.traffic_type),
        partitionKey: message.tenant_id,
        dedupeKey: `message:${payload.submitDate}:${payload.tenantId}:${payload.messageId}:dispatch:${updated.version}`,
        payload: {
          ...payload,
          version: updated.version,
          providerId: route.providerId,
        },
      }, tx);
    });
  }

  private async handleRetry(payload: MessageEventPayload): Promise<void> {
    const composite = this.toComposite(payload);
    const message = await this.messagesService.getMessageRow(composite);
    if (message.status !== 'routed') {
      return;
    }

    await this.databaseService.withTransaction(async (tx) => {
      await this.outboxService.enqueue({
        tenantId: message.tenant_id,
        aggregateType: 'message',
        aggregateId: `${payload.submitDate}:${payload.tenantId}:${payload.messageId}`,
        eventType: 'message.dispatch.retry',
        topicName: this.dispatchTopicFor(message.traffic_type),
        partitionKey: message.tenant_id,
        dedupeKey: `message:${payload.submitDate}:${payload.tenantId}:${payload.messageId}:retry-dispatch:${message.version}`,
        payload: {
          ...payload,
          version: message.version,
          providerId: message.provider_id ?? undefined,
        },
      }, tx);
    });
  }

  private async dispatchThroughProvider(payload: MessageEventPayload): Promise<DispatchResult> {
    if (!payload.providerId) {
      return {
        accepted: false,
        errorCode: 'missing_provider',
        errorMessage: 'No provider selected',
      };
    }

    const provider = await this.providersService.getProvider(payload.providerId);
    const metrics = await this.providersService.getProviderMetrics(provider.id);
    const message = await this.messagesService.getMessageRow(this.toComposite(payload));

    if (metrics.circuitState === 'open') {
      return {
        accepted: false,
        errorCode: 'circuit_open',
        errorMessage: 'Provider circuit is open',
      };
    }

    if (!message.smpp_config_id && provider.defaultProtocol === 'http') {
      if (!provider.httpBaseUrl) {
        return {
          accepted: false,
          errorCode: 'missing_http_base_url',
          errorMessage: 'Provider HTTP base URL is missing',
        };
      }

      return this.httpProviderService.submit({
        url: `${provider.httpBaseUrl}/messages`,
        payload: {
          to: payload.phoneNumber,
          from: payload.senderId,
          text: payload.body,
          clientRef: `${payload.submitDate}:${payload.messageId}`,
        },
      });
    }

    if (!message.smpp_config_id) {
      return {
        accepted: false,
        errorCode: 'missing_smpp_config',
        errorMessage: 'SMPP config missing for routed message',
      };
    }

    const smppConfig = await this.providersService.getSmppConfig(message.smpp_config_id);
    return this.smppConnectorService.submitSm({
      providerId: provider.id,
      host: smppConfig.host,
      port: smppConfig.port,
      systemId: smppConfig.systemId,
      password: smppConfig.secretRef,
      sourceAddr: payload.senderId,
      destinationAddr: payload.phoneNumber,
      shortMessage: payload.body,
    });
  }

  private async handleDispatch(payload: MessageEventPayload): Promise<void> {
    const composite = this.toComposite(payload);
    const message = await this.messagesService.getMessageRow(composite);
    if (message.status !== 'routed') {
      return;
    }

    const fraudEvaluation = await this.fraudService.evaluate({
      tenantId: message.tenant_id,
      phoneNumber: message.phone_number,
      body: message.body,
      senderId: message.source_addr ?? payload.senderId,
      trafficType: message.traffic_type,
    });

    if (fraudEvaluation.action === 'block') {
      await this.databaseService.withTransaction(async (tx) => {
        const updated = await this.messagesService.transitionMessage(tx, message, 'failed', {
          last_error_code: 'fraud_blocked',
          last_error_message: fraudEvaluation.reasons.join(', '),
          billing_state: 'released',
        });
        await this.messagesService.releaseReservedWallet(
          tx,
          message.tenant_id,
          message.price_minor,
          `release:${composite.submitDate}:${composite.tenantId}:${composite.id}:fraud`,
          composite,
        );
        await this.messagesService.logEvent(
          tx,
          composite,
          'failed',
          'routed',
          'failed',
          { reason: fraudEvaluation.reasons },
          message.provider_id,
          null,
          updated.attempt_count,
        );
      });
      return;
    }

    let submittingVersion = message.version;
    await this.databaseService.withTransaction(async (tx) => {
      const updated = await this.messagesService.transitionMessage(tx, message, 'submitting', {}, true);
      submittingVersion = updated.version;
      await this.messagesService.logEvent(
        tx,
        composite,
        'submit_attempt',
        'routed',
        'submitting',
        { version: updated.version },
        updated.provider_id,
        updated.provider_message_id,
        updated.attempt_count,
      );
    });

    let dispatchResult: DispatchResult;
    try {
      dispatchResult = await this.dispatchThroughProvider(payload);
    } catch (error) {
      dispatchResult = {
        accepted: false,
        errorCode: 'provider_dispatch_exception',
        errorMessage: error instanceof Error ? error.message : 'Unknown provider exception',
      };
    }

    await this.databaseService.withTransaction(async (tx) => {
      await this.outboxService.enqueue({
        tenantId: message.tenant_id,
        aggregateType: 'message',
        aggregateId: `${payload.submitDate}:${payload.tenantId}:${payload.messageId}`,
        eventType: 'message.dispatch.result',
        topicName: KafkaTopics.SmsDispatchResults,
        partitionKey: message.tenant_id,
        dedupeKey: `message:${payload.submitDate}:${payload.tenantId}:${payload.messageId}:dispatch-result:${submittingVersion}`,
        payload: {
          ...payload,
          version: submittingVersion,
          accepted: dispatchResult.accepted,
          providerMessageId: dispatchResult.providerMessageId,
          errorCode: dispatchResult.errorCode,
          errorMessage: dispatchResult.errorMessage,
        },
      }, tx);
    });
  }

  private async handleDispatchResult(payload: MessageEventPayload): Promise<void> {
    const composite = this.toComposite(payload);
    const message = await this.messagesService.getMessageRow(composite);
    if (message.status !== 'submitting') {
      return;
    }

    if (payload.accepted) {
      await this.databaseService.withTransaction(async (tx) => {
        const updated = await this.messagesService.transitionMessage(tx, message, 'provider_accepted', {
          provider_message_id: payload.providerMessageId ?? null,
          last_error_code: null,
          last_error_message: null,
        });
        await this.messagesService.debitReservedWallet(
          tx,
          message.tenant_id,
          message.price_minor,
          `debit:${composite.submitDate}:${composite.tenantId}:${composite.id}`,
          composite,
        );
        await this.messagesService.logEvent(
          tx,
          composite,
          'submit_ack',
          'submitting',
          'provider_accepted',
          { providerMessageId: payload.providerMessageId },
          updated.provider_id,
          payload.providerMessageId,
          updated.attempt_count,
        );
      });
      return;
    }

    const retryPolicy = await this.routingService.getRetryPolicy(message.tenant_id, message.provider_id ?? 0);
    const shouldRetry = Boolean(
      payload.errorCode &&
      retryPolicy.retryOnErrors.includes(payload.errorCode) &&
      message.attempt_count < retryPolicy.maxAttempts,
    );

    if (shouldRetry) {
      const retryDelaySeconds = retryPolicy.retryIntervals[Math.min(message.attempt_count - 1, retryPolicy.retryIntervals.length - 1)] ?? 30;

      await this.databaseService.withTransaction(async (tx) => {
        const updated = await this.messagesService.transitionMessage(tx, message, 'routed', {
          last_error_code: payload.errorCode ?? null,
          last_error_message: payload.errorMessage ?? null,
        });
        await this.messagesService.logEvent(
          tx,
          composite,
          'submit_nack',
          'submitting',
          'routed',
          { retryAfterSeconds: retryDelaySeconds, errorCode: payload.errorCode },
          updated.provider_id,
          payload.providerMessageId,
          updated.attempt_count,
        );
        await this.outboxService.enqueue({
          tenantId: message.tenant_id,
          aggregateType: 'message',
          aggregateId: `${payload.submitDate}:${payload.tenantId}:${payload.messageId}`,
          eventType: 'message.retry',
          topicName: KafkaTopics.SmsRetry,
          partitionKey: message.tenant_id,
          dedupeKey: `message:${payload.submitDate}:${payload.tenantId}:${payload.messageId}:retry:${updated.version}`,
          payload: {
            ...payload,
            version: updated.version,
            accepted: false,
          },
          nextAttemptAt: new Date(Date.now() + (retryDelaySeconds * 1000)),
        }, tx);
      });
      return;
    }

    await this.databaseService.withTransaction(async (tx) => {
      const updated = await this.messagesService.transitionMessage(tx, message, 'failed', {
        last_error_code: payload.errorCode ?? 'dispatch_failed',
        last_error_message: payload.errorMessage ?? 'Dispatch failed',
        billing_state: 'released',
      });
      await this.messagesService.releaseReservedWallet(
        tx,
        message.tenant_id,
        message.price_minor,
        `release:${composite.submitDate}:${composite.tenantId}:${composite.id}:final`,
        composite,
      );
      await this.messagesService.logEvent(
        tx,
        composite,
        'failed',
        'submitting',
        'failed',
        { errorCode: payload.errorCode, errorMessage: payload.errorMessage },
        updated.provider_id,
        payload.providerMessageId,
        updated.attempt_count,
      );
    });
  }
}
