import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../common/metrics/metrics.service';
import { DatabaseService } from '../database/database.service';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaTopics } from '../kafka/kafka-topics';
import { DispatchResult, HttpProviderService } from '../connectors/http-provider.service';
import { SmppConnectorService } from '../connectors/smpp.service';
import { ProvidersService } from '../providers/providers.service';
import { RoutingService } from '../routing/routing.service';
import { FraudService } from '../fraud/fraud.service';
import { OutboxService } from '../outbox/outbox.service';
import { RuntimeRoleService } from '../runtime/runtime-role.service';
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
  smppConfigId?: number | null;
  routeRuleId?: number | null;
  protocol?: 'http' | 'smpp';
  providerMessageId?: string;
  accepted?: boolean;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
  retryable?: boolean;
  uncertain?: boolean;
}

interface DispatchExecutionResult {
  protocol: 'http' | 'smpp';
  result: DispatchResult;
}

@Injectable()
export class MessageWorkflowService implements OnModuleInit {
  private readonly logger = new Logger(MessageWorkflowService.name);
  private readonly unknownOutcomeTimeoutMs: number;

  constructor(
    configService: ConfigService,
    private readonly kafkaService: KafkaService,
    private readonly databaseService: DatabaseService,
    private readonly messagesService: MessagesService,
    private readonly routingService: RoutingService,
    private readonly providersService: ProvidersService,
    private readonly fraudService: FraudService,
    private readonly outboxService: OutboxService,
    private readonly httpProviderService: HttpProviderService,
    private readonly smppConnectorService: SmppConnectorService,
    private readonly runtimeRoleService: RuntimeRoleService,
    private readonly metricsService: MetricsService,
  ) {
    this.unknownOutcomeTimeoutMs = configService.getOrThrow<number>('providers.unknownOutcomeTimeoutMs');
  }

  async onModuleInit(): Promise<void> {
    if (!this.runtimeRoleService.hasCapability('messageWorkflow')) {
      return;
    }
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

  private buildAggregateId(composite: MessageCompositeId): string {
    return `${composite.submitDate}:${composite.tenantId}:${composite.id}`;
  }

  private dispatchTopicFor(trafficType: string): string {
    return trafficType === 'marketing' ? KafkaTopics.SmsDispatchBulk : KafkaTopics.SmsDispatchRealtime;
  }

  private shouldExcludeCurrentProvider(errorCode?: string): boolean {
    if (!errorCode) {
      return false;
    }

    return [
      'circuit_open',
      'provider_throttled',
      'throttle',
      'smpp_throttle',
      'http_provider_error',
      'provider_dispatch_exception',
      'provider_dispatch_rejected',
      'missing_http_base_url',
      'missing_smpp_config',
    ].includes(errorCode);
  }

  private async enqueueReconciliation(
    composite: MessageCompositeId,
    payload: MessageEventPayload,
    kind: string,
    reason: string,
  ): Promise<void> {
    await this.databaseService.withTransaction(async (tx) => {
      await this.outboxService.enqueue({
        tenantId: composite.tenantId,
        aggregateType: 'message',
        aggregateId: this.buildAggregateId(composite),
        eventType: 'message.reconcile',
        topicName: KafkaTopics.SmsReconcile,
        partitionKey: composite.tenantId,
        dedupeKey: `message:${this.buildAggregateId(composite)}:reconcile:${kind}:${payload.version}`,
        payload: {
          tenantId: composite.tenantId,
          providerId: payload.providerId,
          submitDate: composite.submitDate,
          messageId: composite.id,
          kind,
          reason,
          payload,
        },
      }, tx);
    });
    this.metricsService.recordRetry('queued', `reconcile_${kind}`);
  }

  private async handleAccepted(payload: MessageEventPayload): Promise<void> {
    const composite = this.toComposite(payload);
    const message = await this.messagesService.getMessageRow(composite);
    if (message.status !== 'accepted') {
      return;
    }

    const route = await this.routingService.selectRoute(message.tenant_id, message.phone_number, message.traffic_type, {
      preferProtocol: message.traffic_type === 'otp' ? 'smpp' : undefined,
    });
    await this.databaseService.withTransaction(async (tx) => {
      const updated = await this.messagesService.transitionMessage(tx, message, 'routed', {
        provider_id: route.providerId,
        smpp_config_id: route.smppConfigId,
        route_rule_id: route.routingRuleId,
        cost_minor: route.estimatedUnitCostMinor * message.message_parts,
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
        aggregateId: this.buildAggregateId(composite),
        eventType: 'message.dispatch',
        topicName: this.dispatchTopicFor(message.traffic_type),
        partitionKey: message.tenant_id,
        dedupeKey: `message:${this.buildAggregateId(composite)}:dispatch:${updated.version}`,
        payload: {
          ...payload,
          version: updated.version,
          providerId: route.providerId,
          smppConfigId: route.smppConfigId,
          routeRuleId: route.routingRuleId,
          protocol: route.protocol,
        },
      }, tx);
    });
  }

  private async handleRetry(payload: MessageEventPayload): Promise<void> {
    const composite = this.toComposite(payload);
    const message = await this.messagesService.getMessageRow(composite);
    if (message.status !== 'submitting') {
      return;
    }

    await this.databaseService.withTransaction(async (tx) => {
      await this.outboxService.enqueue({
        tenantId: message.tenant_id,
        aggregateType: 'message',
        aggregateId: this.buildAggregateId(composite),
        eventType: 'message.dispatch.retry',
        topicName: this.dispatchTopicFor(message.traffic_type),
        partitionKey: message.tenant_id,
        dedupeKey: `message:${this.buildAggregateId(composite)}:retry-dispatch:${message.version}`,
        payload: {
          ...payload,
          version: message.version,
          providerId: message.provider_id ?? undefined,
          smppConfigId: message.smpp_config_id,
        },
      }, tx);
    });
  }

  private async dispatchThroughProvider(payload: MessageEventPayload): Promise<DispatchExecutionResult> {
    if (!payload.providerId) {
      return {
        protocol: payload.protocol ?? 'http',
        result: {
          accepted: false,
          errorCode: 'missing_provider',
          errorMessage: 'No provider selected',
        },
      };
    }

    const provider = await this.providersService.getProvider(payload.providerId);
    await this.providersService.assertProviderDispatchAllowed(provider.id, provider.maxGlobalTps);
    const message = await this.messagesService.getMessageRow(this.toComposite(payload));
    const protocol = payload.protocol ?? (message.smpp_config_id ? 'smpp' : provider.defaultProtocol);

    if (protocol === 'http') {
      if (!provider.httpBaseUrl) {
        return {
          protocol,
          result: {
            accepted: false,
            errorCode: 'missing_http_base_url',
            errorMessage: 'Provider HTTP base URL is missing',
          },
        };
      }

      return {
        protocol,
        result: await this.httpProviderService.submit({
          url: `${provider.httpBaseUrl}/messages`,
          payload: {
            to: payload.phoneNumber,
            from: payload.senderId,
            text: payload.body,
            clientRef: `${payload.submitDate}:${payload.messageId}`,
          },
        }),
      };
    }

    if (!message.smpp_config_id) {
      return {
        protocol,
        result: {
          accepted: false,
          errorCode: 'missing_smpp_config',
          errorMessage: 'SMPP config missing for routed message',
        },
      };
    }

    const smppConfig = await this.providersService.getSmppConfig(message.smpp_config_id);
    return {
      protocol,
      result: await this.smppConnectorService.submitSm({
        providerId: provider.id,
        host: smppConfig.host,
        port: smppConfig.port,
        systemId: smppConfig.systemId,
        passwordRef: smppConfig.secretRef,
        maxSessions: smppConfig.maxSessions,
        sessionTps: smppConfig.sessionTps,
        sourceAddr: payload.senderId,
        destinationAddr: payload.phoneNumber,
        shortMessage: payload.body,
      }),
    };
  }

  private async handleDispatch(payload: MessageEventPayload): Promise<void> {
    const composite = this.toComposite(payload);
    const message = await this.messagesService.getMessageRow(composite);
    if (!['routed', 'submitting'].includes(message.status)) {
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
      this.metricsService.recordRetry('failed', 'fraud_blocked');
      await this.databaseService.withTransaction(async (tx) => {
        const submitting = message.status === 'routed'
          ? await this.messagesService.transitionMessage(tx, message, 'submitting', {}, true)
          : await this.messagesService.patchMessage(tx, message, {});
        const updated = await this.messagesService.transitionMessage(tx, submitting, 'failed', {
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
          submitting.status,
          'failed',
          { reason: fraudEvaluation.reasons },
          message.provider_id,
          null,
          updated.attempt_count,
        );
      });
      return;
    }

    if (fraudEvaluation.action === 'throttle') {
      this.metricsService.recordRetry('queued', 'fraud_throttled');
      await this.databaseService.withTransaction(async (tx) => {
        const updated = await this.messagesService.patchMessage(tx, message, {
          last_error_code: 'fraud_throttled',
          last_error_message: fraudEvaluation.reasons.join(', '),
        });
        await this.messagesService.logEvent(
          tx,
          composite,
          'submit_throttled',
          'routed',
          'routed',
          { reason: fraudEvaluation.reasons, score: fraudEvaluation.score },
          message.provider_id,
          null,
          updated.attempt_count,
        );
        await this.outboxService.enqueue({
          tenantId: message.tenant_id,
          aggregateType: 'message',
          aggregateId: this.buildAggregateId(composite),
          eventType: 'message.retry',
          topicName: KafkaTopics.SmsRetry,
          partitionKey: message.tenant_id,
          dedupeKey: `message:${this.buildAggregateId(composite)}:fraud-throttle:${updated.version}`,
          payload: {
            ...payload,
            version: updated.version,
          },
          nextAttemptAt: new Date(Date.now() + 30_000),
        }, tx);
      });
      return;
    }

    let submittingVersion = message.version;
    await this.databaseService.withTransaction(async (tx) => {
      const updated = message.status === 'routed'
        ? await this.messagesService.transitionMessage(tx, message, 'submitting', {}, true)
        : await this.messagesService.patchMessage(tx, message, { attempt_count: message.attempt_count + 1 });
      submittingVersion = updated.version;
      await this.messagesService.logEvent(
        tx,
        composite,
        'submit_attempt',
        message.status,
        'submitting',
        { version: updated.version },
        updated.provider_id,
        updated.provider_message_id,
        updated.attempt_count,
      );
    });

    let dispatchExecution: DispatchExecutionResult;
    try {
      dispatchExecution = await this.dispatchThroughProvider(payload);
    } catch (error) {
      dispatchExecution = {
        protocol: payload.protocol ?? 'http',
        result: {
          accepted: false,
          errorCode: error instanceof Error && error.message === 'Provider circuit is open'
            ? 'circuit_open'
            : 'provider_dispatch_exception',
          errorMessage: error instanceof Error ? error.message : 'Unknown provider exception',
          latencyMs: 0,
          retryable: true,
          uncertain: false,
        },
      };
    }

    if (payload.providerId) {
      await this.providersService.recordDispatchResult({
        providerId: payload.providerId,
        protocol: dispatchExecution.protocol,
        accepted: dispatchExecution.result.accepted,
        latencyMs: dispatchExecution.result.latencyMs ?? 0,
        errorCode: dispatchExecution.result.errorCode,
        smppConfigId: payload.smppConfigId ?? message.smpp_config_id,
      });
    }

    await this.databaseService.withTransaction(async (tx) => {
      await this.outboxService.enqueue({
        tenantId: message.tenant_id,
        aggregateType: 'message',
        aggregateId: this.buildAggregateId(composite),
        eventType: 'message.dispatch.result',
        topicName: KafkaTopics.SmsDispatchResults,
        partitionKey: message.tenant_id,
        dedupeKey: `message:${this.buildAggregateId(composite)}:dispatch-result:${submittingVersion}`,
        payload: {
          ...payload,
          version: submittingVersion,
          accepted: dispatchExecution.result.accepted,
          providerMessageId: dispatchExecution.result.providerMessageId,
          errorCode: dispatchExecution.result.errorCode,
          errorMessage: dispatchExecution.result.errorMessage,
          latencyMs: dispatchExecution.result.latencyMs,
          retryable: dispatchExecution.result.retryable,
          uncertain: dispatchExecution.result.uncertain,
          protocol: dispatchExecution.protocol,
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

    if (payload.uncertain) {
      this.metricsService.recordDispatchAttempt(
        message.provider_id ?? 'unknown',
        payload.protocol ?? 'http',
        'uncertain',
      );
      await this.databaseService.withTransaction(async (tx) => {
        const updated = await this.messagesService.patchMessage(tx, message, {
          last_error_code: payload.errorCode ?? 'unknown_submit_outcome',
          last_error_message: payload.errorMessage ?? 'Dispatch outcome is uncertain',
        });
        await this.messagesService.logEvent(
          tx,
          composite,
          'submit_unknown',
          'submitting',
          'submitting',
          {
            errorCode: payload.errorCode,
            errorMessage: payload.errorMessage,
            timeoutMs: this.unknownOutcomeTimeoutMs,
          },
          updated.provider_id,
          payload.providerMessageId,
          updated.attempt_count,
        );
        await this.outboxService.enqueue({
          tenantId: message.tenant_id,
          aggregateType: 'message',
          aggregateId: this.buildAggregateId(composite),
          eventType: 'message.reconcile',
          topicName: KafkaTopics.SmsReconcile,
          partitionKey: message.tenant_id,
          dedupeKey: `message:${this.buildAggregateId(composite)}:dispatch-uncertain:${updated.version}`,
          payload: {
            tenantId: message.tenant_id,
            providerId: message.provider_id,
            submitDate: composite.submitDate,
            messageId: composite.id,
            kind: 'unknown_submit_outcome',
            reason: payload.errorCode ?? 'unknown_submit_outcome',
            payload,
          },
        }, tx);
      });
      this.metricsService.recordRetry('queued', 'unknown_submit_outcome');
      return;
    }

    const retryPolicy = await this.routingService.getRetryPolicy(
      message.tenant_id,
      message.provider_id ?? 0,
      message.traffic_type,
    );
    const shouldRetry = Boolean(
      payload.errorCode &&
      retryPolicy.retryOnErrors.includes(payload.errorCode) &&
      message.attempt_count < retryPolicy.maxAttempts,
    );

    if (shouldRetry) {
      this.metricsService.recordRetry('queued', payload.errorCode ?? 'retryable_error');
      const retryDelaySeconds = retryPolicy.retryIntervals[Math.min(
        Math.max(message.attempt_count - 1, 0),
        retryPolicy.retryIntervals.length - 1,
      )] ?? 30;

      let nextRoute = null;
      try {
        nextRoute = await this.routingService.selectRoute(message.tenant_id, message.phone_number, message.traffic_type, {
          preferProtocol: message.traffic_type === 'otp' ? 'smpp' : undefined,
          excludedProviderIds: this.shouldExcludeCurrentProvider(payload.errorCode) && message.provider_id
            ? [message.provider_id]
            : undefined,
          excludedRuleIds: message.route_rule_id ? [message.route_rule_id] : undefined,
        });
      } catch (error) {
        this.logger.warn(
          `Retry route selection fell back to current provider for ${this.buildAggregateId(composite)}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }

      await this.databaseService.withTransaction(async (tx) => {
        const updated = await this.messagesService.patchMessage(tx, message, {
          provider_id: nextRoute?.providerId ?? message.provider_id,
          smpp_config_id: nextRoute?.smppConfigId ?? message.smpp_config_id,
          route_rule_id: nextRoute?.routingRuleId ?? message.route_rule_id,
          cost_minor: nextRoute
            ? nextRoute.estimatedUnitCostMinor * message.message_parts
            : undefined,
          last_error_code: payload.errorCode ?? null,
          last_error_message: payload.errorMessage ?? null,
        });
        await this.messagesService.logEvent(
          tx,
          composite,
          'submit_retry_scheduled',
          'submitting',
          'submitting',
          {
            retryAfterSeconds: retryDelaySeconds,
            errorCode: payload.errorCode,
            errorMessage: payload.errorMessage,
            reroutedProviderId: nextRoute?.providerId ?? message.provider_id,
          },
          updated.provider_id,
          payload.providerMessageId,
          updated.attempt_count,
        );
        await this.outboxService.enqueue({
          tenantId: message.tenant_id,
          aggregateType: 'message',
          aggregateId: this.buildAggregateId(composite),
          eventType: 'message.retry',
          topicName: KafkaTopics.SmsRetry,
          partitionKey: message.tenant_id,
          dedupeKey: `message:${this.buildAggregateId(composite)}:retry:${updated.version}`,
          payload: {
            ...payload,
            version: updated.version,
            accepted: false,
            providerId: updated.provider_id ?? undefined,
            smppConfigId: updated.smpp_config_id,
            routeRuleId: updated.route_rule_id,
            protocol: nextRoute?.protocol ?? payload.protocol,
          },
          nextAttemptAt: new Date(Date.now() + (retryDelaySeconds * 1000)),
        }, tx);
      });
      return;
    }

    this.metricsService.recordRetry('failed', payload.errorCode ?? 'dispatch_failed');
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
