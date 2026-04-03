import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiPrincipal, AuthenticatedRequest, JwtClaims } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../common/metrics/metrics.service';
import { resolveTenantScope } from '../common/utils/tenant-scope';
import { ComplianceService } from '../compliance/compliance.service';
import { DatabaseService, TransactionContext } from '../database/database.service';
import { FraudService } from '../fraud/fraud.service';
import { KafkaTopics } from '../kafka/kafka-topics';
import { OutboxService } from '../outbox/outbox.service';
import { RateLimitService } from '../redis/rate-limit.service';
import { RoutingService } from '../routing/routing.service';
import { SenderIdsService } from '../sender-ids/sender-ids.service';
import { TemplatesService } from '../templates/templates.service';
import { MessageExplorerQueryDto } from './dto/message-explorer-query.dto';
import { SubmitMessageDto } from './dto/submit-message.dto';
import { AllowedTransitions, MessageCompositeId, MessageStatus } from './messages.types';

export interface MessageRow {
  id: number;
  submit_date: string;
  tenant_id: string;
  campaign_id?: number | null;
  api_key_id: string | null;
  client_message_id: string | null;
  api_idempotency_key: string | null;
  source_addr: string | null;
  phone_number: string;
  body: string;
  traffic_type: string;
  status: MessageStatus;
  version: number;
  attempt_count: number;
  provider_id: number | null;
  smpp_config_id: number | null;
  route_rule_id: number | null;
  provider_message_id: string | null;
  price_minor: number;
  billing_state: string;
  message_parts: number;
  accepted_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  body_hash?: string | null;
}

interface TenantPolicyRow {
  api_rate_limit_rps: number;
  submit_tps_limit: number;
}

interface WalletRow {
  id: number;
  available_balance_minor: number;
  reserved_balance_minor: number;
  credit_limit_minor: number;
  currency: string;
}

type BillingOperation = 'reserve' | 'debit' | 'release';

interface SubmissionContext {
  tenantId: string;
  apiKeyId?: string | null;
  scopes: string[];
  rateLimitRps?: number | null;
  dailyQuota?: number | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly rateLimitService: RateLimitService,
    private readonly templatesService: TemplatesService,
    private readonly routingService: RoutingService,
    private readonly senderIdsService: SenderIdsService,
    private readonly fraudService: FraudService,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
    private readonly complianceService: ComplianceService,
    private readonly metricsService: MetricsService,
  ) {}

  private normalizePhoneNumber(phoneNumber: string): string {
    const trimmed = phoneNumber.replace(/[^\d+]/g, '');
    if (trimmed.startsWith('+')) {
      return trimmed;
    }
    if (trimmed.startsWith('251')) {
      return `+${trimmed}`;
    }
    if (trimmed.startsWith('0')) {
      return `+251${trimmed.slice(1)}`;
    }
    throw new BadRequestException('Phone number must be in Ethiopian local format or E.164');
  }

  private computeMessageParts(body: string): number {
    return body.length <= 160 ? 1 : Math.ceil(body.length / 153);
  }

  private countryCodeFor(phoneNumber: string): string {
    return phoneNumber.startsWith('+251') ? 'ET' : 'INTL';
  }

  private toDateString(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return value.slice(0, 10);
  }

  private buildAggregateId(composite: MessageCompositeId): string {
    return `${composite.submitDate}:${composite.tenantId}:${composite.id}`;
  }

  private buildMessageResponse(
    row: MessageRow,
    routePreview?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      id: row.id,
      submitDate: this.toDateString(row.submit_date),
      tenantId: row.tenant_id,
      clientMessageId: row.client_message_id,
      phoneNumber: row.phone_number,
      body: row.body,
      trafficType: row.traffic_type,
      status: row.status,
      version: row.version,
      attemptCount: row.attempt_count,
      providerId: row.provider_id,
      providerMessageId: row.provider_message_id,
      priceMinor: row.price_minor,
      billingState: row.billing_state,
      routePreview,
      acceptedAt: row.accepted_at,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      failedAt: row.failed_at,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
    };
  }

  private async getTenantPolicy(tenantId: string): Promise<TenantPolicyRow> {
    const result = await this.databaseService.query<TenantPolicyRow>(
      'SELECT api_rate_limit_rps, submit_tps_limit FROM tenants WHERE id = $1',
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Tenant not found');
    }
    return row;
  }

  private async getSellUnitPriceMinor(
    tenantId: string,
    countryCode: string,
    trafficType: string,
    parts: number,
  ): Promise<number> {
    const result = await this.databaseService.query<{ unit_price_minor: number }>(
      `
        SELECT unit_price_minor
        FROM pricing_rules
        WHERE kind = 'sell'
          AND tenant_id = $1
          AND country_code = $2
          AND traffic_type = $3
          AND parts_from <= $4
          AND parts_to >= $4
          AND is_active = TRUE
          AND (effective_to IS NULL OR effective_to > now())
        ORDER BY effective_from DESC
        LIMIT 1
      `,
      [tenantId, countryCode, trafficType, parts],
    );

    return result.rows[0]?.unit_price_minor ?? 0;
  }

  private async consumeSubmissionQuotas(principal: ApiPrincipal, tenantPolicy: TenantPolicyRow): Promise<void> {
    await this.rateLimitService.enforceLimit(
      `rl:tenant:${principal.tenantId}:api`,
      tenantPolicy.api_rate_limit_rps,
      1,
    );
    await this.rateLimitService.enforceLimit(
      `rl:tenant:${principal.tenantId}:submit`,
      tenantPolicy.submit_tps_limit,
      1,
    );

    if (principal.rateLimitRps) {
      await this.rateLimitService.enforceLimit(
        `rl:key:${principal.apiKeyId}:api`,
        principal.rateLimitRps,
        1,
      );
    }

    if (principal.dailyQuota) {
      const currentDate = new Date().toISOString().slice(0, 10);
      await this.rateLimitService.enforceDailyQuota(
        `quota:key:${principal.apiKeyId}:${currentDate}`,
        principal.dailyQuota,
      );
    }
  }

  private async ledgerExists(
    tx: TransactionContext,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const result = await tx.client.query<{ exists: boolean }>(
      `
        SELECT TRUE AS exists
        FROM transactions
        WHERE tenant_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [tenantId, idempotencyKey],
    );
    return Boolean(result.rows[0]?.exists);
  }

  private async applyWalletLedger(
    tx: TransactionContext,
    tenantId: string,
    amountMinor: number,
    operation: BillingOperation,
    idempotencyKey: string,
    messageRef: MessageCompositeId,
  ): Promise<boolean> {
    if (amountMinor <= 0) {
      return false;
    }

    if (await this.ledgerExists(tx, tenantId, idempotencyKey)) {
      this.metricsService.recordWalletOperation(operation, 'duplicate');
      return false;
    }

    const walletResult = await tx.client.query<WalletRow>(
      `
        SELECT id, available_balance_minor, reserved_balance_minor, credit_limit_minor, currency
        FROM wallets
        WHERE tenant_id = $1
        FOR UPDATE
      `,
      [tenantId],
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    let availableAfter = wallet.available_balance_minor;
    let reservedAfter = wallet.reserved_balance_minor;

    if (operation === 'reserve') {
      const availableWithCredit = wallet.available_balance_minor + wallet.credit_limit_minor;
      if (availableWithCredit < amountMinor) {
        throw new ForbiddenException('Insufficient wallet balance');
      }
      availableAfter -= amountMinor;
      reservedAfter += amountMinor;
    }

    if (operation === 'debit') {
      if (wallet.reserved_balance_minor < amountMinor) {
        throw new ConflictException('Reserved wallet balance is insufficient for debit');
      }
      reservedAfter = wallet.reserved_balance_minor - amountMinor;
    }

    if (operation === 'release') {
      if (wallet.reserved_balance_minor < amountMinor) {
        throw new ConflictException('Reserved wallet balance is insufficient for release');
      }
      availableAfter += amountMinor;
      reservedAfter = wallet.reserved_balance_minor - amountMinor;
    }

    await tx.client.query(
      `
        UPDATE wallets
        SET available_balance_minor = $2,
            reserved_balance_minor = $3,
            version = version + 1,
            updated_at = now()
        WHERE tenant_id = $1
      `,
      [tenantId, availableAfter, reservedAfter],
    );

    const balanceBefore = operation === 'reserve'
      ? wallet.available_balance_minor
      : wallet.reserved_balance_minor;
    const balanceAfter = operation === 'reserve'
      ? availableAfter
      : reservedAfter;

    await tx.client.query(
      `
        INSERT INTO transactions (
          ledger_date,
          tenant_id,
          wallet_id,
          message_submit_date,
          message_id,
          kind,
          amount_minor,
          currency,
          balance_before_minor,
          balance_after_minor,
          idempotency_key,
          metadata
        )
        VALUES (
          CURRENT_DATE,
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )
      `,
      [
        tenantId,
        wallet.id,
        messageRef.submitDate,
        messageRef.id,
        operation,
        amountMinor,
        wallet.currency,
        balanceBefore,
        balanceAfter,
        idempotencyKey,
        JSON.stringify({ messageRef, operation }),
      ],
    );

    await this.auditService.write({
      tenantId,
      action: `wallet.${operation}`,
      targetType: 'wallet',
      targetId: String(wallet.id),
      metadata: {
        amountMinor,
        currency: wallet.currency,
        messageRef,
        idempotencyKey,
      },
    }, tx);
    this.metricsService.recordWalletOperation(operation, 'success');

    return true;
  }

  async reserveWallet(
    tx: TransactionContext,
    tenantId: string,
    amountMinor: number,
    idempotencyKey: string,
    messageRef: MessageCompositeId,
  ): Promise<boolean> {
    return this.applyWalletLedger(tx, tenantId, amountMinor, 'reserve', idempotencyKey, messageRef);
  }

  async debitReservedWallet(
    tx: TransactionContext,
    tenantId: string,
    amountMinor: number,
    idempotencyKey: string,
    messageRef: MessageCompositeId,
  ): Promise<boolean> {
    return this.applyWalletLedger(tx, tenantId, amountMinor, 'debit', idempotencyKey, messageRef);
  }

  async releaseReservedWallet(
    tx: TransactionContext,
    tenantId: string,
    amountMinor: number,
    idempotencyKey: string,
    messageRef: MessageCompositeId,
  ): Promise<boolean> {
    return this.applyWalletLedger(tx, tenantId, amountMinor, 'release', idempotencyKey, messageRef);
  }

  async logEvent(
    tx: TransactionContext,
    messageRef: MessageCompositeId,
    eventType: string,
    statusFrom: MessageStatus | null,
    statusTo: MessageStatus | null,
    payload: Record<string, unknown>,
    providerId?: number | null,
    providerMessageId?: string | null,
    attemptNo?: number,
  ): Promise<void> {
    await tx.client.query(
      `
        INSERT INTO message_logs (
          log_date,
          tenant_id,
          message_submit_date,
          message_id,
          event_type,
          status_from,
          status_to,
          provider_id,
          provider_message_id,
          attempt_no,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        messageRef.submitDate,
        messageRef.tenantId,
        messageRef.submitDate,
        messageRef.id,
        eventType,
        statusFrom,
        statusTo,
        providerId ?? null,
        providerMessageId ?? null,
        attemptNo ?? 0,
        JSON.stringify(payload),
      ],
    );
  }

  async getMessage(messageRef: MessageCompositeId): Promise<Record<string, unknown>> {
    const message = await this.getMessageRow(messageRef);
    return this.buildMessageResponse(message);
  }

  async getMessageRow(messageRef: MessageCompositeId): Promise<MessageRow> {
    const result = await this.databaseService.query<MessageRow>(
      `
        SELECT
          id,
          submit_date,
          tenant_id,
          api_key_id,
          client_message_id,
          api_idempotency_key,
          source_addr,
          phone_number,
          body,
          traffic_type,
          status,
          version,
          attempt_count,
          provider_id,
          smpp_config_id,
          route_rule_id,
          provider_message_id,
          price_minor,
          billing_state,
          message_parts,
          accepted_at,
          sent_at,
          delivered_at,
          failed_at,
          last_error_code,
          last_error_message
        FROM messages
        WHERE submit_date = $1 AND tenant_id = $2 AND id = $3
      `,
      [messageRef.submitDate, messageRef.tenantId, messageRef.id],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Message not found');
    }
    return row;
  }

  async patchMessage(
    tx: TransactionContext,
    message: MessageRow,
    fields: Record<string, unknown>,
  ): Promise<MessageRow> {
    const assignments = ['version = version + 1', 'state_changed_at = now()'];
    const values: unknown[] = [];
    let parameterIndex = 1;

    for (const [column, value] of Object.entries(fields).filter(([, value]) => value !== undefined)) {
      assignments.push(`${column} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    }

    values.push(
      this.toDateString(message.submit_date),
      message.tenant_id,
      message.id,
      message.status,
      message.version,
    );

    const result = await tx.client.query<MessageRow>(
      `
        UPDATE messages
        SET ${assignments.join(', ')}
        WHERE submit_date = $${parameterIndex}
          AND tenant_id = $${parameterIndex + 1}
          AND id = $${parameterIndex + 2}
          AND status = $${parameterIndex + 3}
          AND version = $${parameterIndex + 4}
        RETURNING
          id,
          submit_date,
          tenant_id,
          api_key_id,
          client_message_id,
          api_idempotency_key,
          source_addr,
          phone_number,
          body,
          traffic_type,
          status,
          version,
          attempt_count,
          provider_id,
          smpp_config_id,
          route_rule_id,
          provider_message_id,
          price_minor,
          billing_state,
          message_parts,
          accepted_at,
          sent_at,
          delivered_at,
          failed_at,
          last_error_code,
          last_error_message
      `,
      values,
    );

    const updated = result.rows[0];
    if (!updated) {
      throw new ConflictException('Message version conflict');
    }
    return updated;
  }

  async transitionMessage(
    tx: TransactionContext,
    message: MessageRow,
    nextStatus: MessageStatus,
    fields: Record<string, unknown> = {},
    incrementAttempt = false,
  ): Promise<MessageRow> {
    if (!AllowedTransitions[message.status].includes(nextStatus)) {
      throw new ConflictException(`Invalid status transition ${message.status} -> ${nextStatus}`);
    }

    const assignments = ['status = $1', 'version = version + 1', 'state_changed_at = now()'];
    const values: unknown[] = [nextStatus];
    let parameterIndex = 2;

    for (const [column, value] of Object.entries(fields).filter(([, value]) => value !== undefined)) {
      assignments.push(`${column} = $${parameterIndex}`);
      values.push(value);
      parameterIndex += 1;
    }

    if (incrementAttempt) {
      assignments.push('attempt_count = attempt_count + 1');
    }
    if (nextStatus === 'provider_accepted') {
      assignments.push('sent_at = COALESCE(sent_at, now())');
      assignments.push(`billing_state = 'debited'`);
    }
    if (nextStatus === 'delivered') {
      assignments.push('delivered_at = COALESCE(delivered_at, now())');
    }
    if (nextStatus === 'failed') {
      assignments.push('failed_at = COALESCE(failed_at, now())');
    }

    values.push(
      this.toDateString(message.submit_date),
      message.tenant_id,
      message.id,
      message.status,
      message.version,
    );

    const result = await tx.client.query<MessageRow>(
      `
        UPDATE messages
        SET ${assignments.join(', ')}
        WHERE submit_date = $${parameterIndex}
          AND tenant_id = $${parameterIndex + 1}
          AND id = $${parameterIndex + 2}
          AND status = $${parameterIndex + 3}
          AND version = $${parameterIndex + 4}
        RETURNING
          id,
          submit_date,
          tenant_id,
          api_key_id,
          client_message_id,
          api_idempotency_key,
          source_addr,
          phone_number,
          body,
          traffic_type,
          status,
          version,
          attempt_count,
          provider_id,
          smpp_config_id,
          route_rule_id,
          provider_message_id,
          price_minor,
          billing_state,
          message_parts,
          accepted_at,
          sent_at,
          delivered_at,
          failed_at,
          last_error_code,
          last_error_message
      `,
      values,
    );
    const updated = result.rows[0];
    if (!updated) {
      throw new ConflictException('Message version conflict');
    }
    this.metricsService.recordMessageTransition(message.status, nextStatus);

    await this.auditService.write({
      tenantId: updated.tenant_id,
      apiKeyId: updated.api_key_id ?? undefined,
      action: 'messages.transition',
      targetType: 'message',
      targetId: this.buildAggregateId({
        submitDate: this.toDateString(updated.submit_date),
        tenantId: updated.tenant_id,
        id: updated.id,
      }),
      metadata: {
        from: message.status,
        to: nextStatus,
        version: updated.version,
        providerId: updated.provider_id,
        providerMessageId: updated.provider_message_id,
        attemptCount: updated.attempt_count,
      },
    }, tx);

    return updated;
  }

  private async submitMessageWithContext(
    context: SubmissionContext,
    dto: SubmitMessageDto,
  ): Promise<Record<string, unknown>> {
    if (!context.scopes.includes('sms:send')) {
      throw new ForbiddenException('Sender does not have sms:send scope');
    }

    const principal: ApiPrincipal = {
      apiKeyId: context.apiKeyId ?? 'control-plane',
      tenantId: context.tenantId,
      name: 'control-plane',
      scopes: context.scopes,
      rateLimitRps: context.rateLimitRps ?? null,
      dailyQuota: context.dailyQuota ?? null,
    };

    const tenantPolicy = await this.getTenantPolicy(context.tenantId);
    await this.consumeSubmissionQuotas(principal, tenantPolicy);

    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);
    await this.complianceService.assertNotOptedOut(context.tenantId, phoneNumber);

    const trafficType = dto.trafficType ?? 'transactional';
    let body = dto.body ?? '';
    if (!body && !dto.templateRef) {
      throw new BadRequestException('Either body or templateRef is required');
    }

    if (dto.templateRef) {
      const template = await this.templatesService.resolveTemplate(context.tenantId, dto.templateRef);
      body = this.templatesService.render(template.body, dto.mergeData);
    }

    if (body.length === 0) {
      throw new BadRequestException('Message body must not be empty');
    }

    const routePreview = await this.routingService.selectRoute(context.tenantId, phoneNumber, trafficType);
    await this.senderIdsService.ensureApproved(context.tenantId, dto.senderId, routePreview.providerId);
    await this.fraudService.enforceSubmission({
      tenantId: context.tenantId,
      phoneNumber,
      body,
      senderId: dto.senderId,
      trafficType,
    });

    const messageParts = this.computeMessageParts(body);
    const countryCode = this.countryCodeFor(phoneNumber);
    const sellUnitPriceMinor = await this.getSellUnitPriceMinor(context.tenantId, countryCode, trafficType, messageParts);
    const totalSellPriceMinor = sellUnitPriceMinor * messageParts;
    const totalProviderCostMinor = routePreview.estimatedUnitCostMinor * messageParts;
    const idempotencyKey = context.idempotencyKey ?? null;
    const bodyHash = createHash('sha256').update(body).digest('hex');

    return this.databaseService.withTransaction(async (tx) => {
      if (idempotencyKey || dto.clientMessageId) {
        const existing = await tx.client.query<MessageRow>(
          `
            SELECT
              id, submit_date, tenant_id, api_key_id, client_message_id, api_idempotency_key, source_addr,
              phone_number, body, traffic_type, status, version, attempt_count, provider_id, smpp_config_id,
              route_rule_id, provider_message_id, price_minor, billing_state, message_parts, accepted_at,
              sent_at, delivered_at, failed_at, last_error_code, last_error_message
            FROM messages
            WHERE submit_date = CURRENT_DATE
              AND tenant_id = $1
              AND (
                ($2::varchar IS NOT NULL AND api_idempotency_key = $2)
                OR ($3::varchar IS NOT NULL AND client_message_id = $3)
              )
            LIMIT 1
          `,
          [context.tenantId, idempotencyKey, dto.clientMessageId ?? null],
        );

        if (existing.rows[0]) {
          return this.buildMessageResponse(existing.rows[0], routePreview as unknown as Record<string, unknown>);
        }
      }

      const insert = await tx.client.query<MessageRow>(
        `
          INSERT INTO messages (
            submit_date,
            tenant_id,
            client_message_id,
            api_idempotency_key,
            source_addr,
            phone_number,
            body,
            encoding,
            message_parts,
            traffic_type,
            priority,
            status,
            billing_state,
            provider_id,
            smpp_config_id,
            route_rule_id,
            price_minor,
            cost_minor,
            currency,
            metadata,
            api_key_id,
            template_ref,
            body_hash
          )
          VALUES (
            CURRENT_DATE,
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'gsm7',
            $7,
            $8,
            5,
            'accepted',
            'reserved',
            $9,
            $10,
            $11,
            $12,
            $13,
            'ETB',
            $14,
            $15,
            $16,
            $17
          )
          RETURNING
            id,
            submit_date,
            tenant_id,
            api_key_id,
            client_message_id,
            api_idempotency_key,
            source_addr,
            phone_number,
            body,
            traffic_type,
            status,
            version,
            attempt_count,
            provider_id,
            smpp_config_id,
            route_rule_id,
            provider_message_id,
            price_minor,
            billing_state,
            message_parts,
            accepted_at,
            sent_at,
            delivered_at,
            failed_at,
            last_error_code,
            last_error_message
        `,
        [
          context.tenantId,
          dto.clientMessageId ?? null,
          idempotencyKey,
          dto.senderId,
          phoneNumber,
          body,
          messageParts,
          trafficType,
          routePreview.providerId,
          routePreview.smppConfigId,
          routePreview.routingRuleId,
          totalSellPriceMinor,
          totalProviderCostMinor,
          JSON.stringify({
            mergeData: dto.mergeData ?? {},
            requestId: context.requestId ?? null,
          }),
          context.apiKeyId ?? null,
          dto.templateRef ?? null,
          bodyHash,
        ],
      );

      const message = insert.rows[0];
      if (!message) {
        throw new NotFoundException('Unable to create message');
      }

      const composite: MessageCompositeId = {
        submitDate: this.toDateString(message.submit_date),
        tenantId: message.tenant_id,
        id: message.id,
      };

      await this.reserveWallet(
        tx,
        context.tenantId,
        totalSellPriceMinor,
        `reserve:${this.buildAggregateId(composite)}`,
        composite,
      );

      await this.logEvent(
        tx,
        composite,
        'api_accepted',
        null,
        'accepted',
        {
          requestId: context.requestId ?? null,
          routePreview,
          messageParts,
        },
        routePreview.providerId,
        null,
        0,
      );

      await this.outboxService.enqueue({
        tenantId: message.tenant_id,
        aggregateType: 'message',
        aggregateId: this.buildAggregateId(composite),
        eventType: 'message.accepted',
        topicName: KafkaTopics.SmsAccepted,
        partitionKey: message.tenant_id,
        dedupeKey: `message:${this.buildAggregateId(composite)}:accepted`,
        payload: {
          submitDate: composite.submitDate,
          tenantId: composite.tenantId,
          messageId: composite.id,
          version: message.version,
          phoneNumber: message.phone_number,
          body: message.body,
          senderId: dto.senderId,
          trafficType: message.traffic_type,
          providerId: routePreview.providerId,
          smppConfigId: routePreview.smppConfigId,
        },
      }, tx);
      this.metricsService.recordMessageSubmission(
        context.apiKeyId ? 'api' : 'control_plane',
        trafficType,
        'accepted',
      );

      return this.buildMessageResponse(message, {
        ...routePreview,
        estimatedUnitCostMinor: totalProviderCostMinor,
        totalSellPriceMinor,
      });
    });
  }

  async submitMessage(
    request: AuthenticatedRequest,
    dto: SubmitMessageDto,
  ): Promise<Record<string, unknown>> {
    const principal = request.apiPrincipal;
    if (!principal) {
      throw new UnauthorizedException('API principal is missing');
    }

    return this.submitMessageWithContext({
      tenantId: principal.tenantId,
      apiKeyId: principal.apiKeyId,
      scopes: principal.scopes,
      rateLimitRps: principal.rateLimitRps,
      dailyQuota: principal.dailyQuota,
      requestId: request.headers['x-request-id']?.toString() ?? null,
      idempotencyKey: request.headers['x-idempotency-key']?.toString() ?? null,
    }, dto);
  }

  async submitControlPlaneMessage(
    user: JwtClaims,
    dto: SubmitMessageDto,
    requestId?: string | null,
    idempotencyKey?: string | null,
  ): Promise<Record<string, unknown>> {
    return this.submitMessageWithContext({
      tenantId: user.tenantId,
      scopes: ['sms:send'],
      requestId: requestId ?? null,
      idempotencyKey: idempotencyKey ?? null,
    }, dto);
  }

  async listMessages(user: JwtClaims, query: MessageExplorerQueryDto): Promise<Record<string, unknown>> {
    const tenantId = resolveTenantScope(user, query.tenantId);
    const offset = (query.page - 1) * query.limit;
    const params: unknown[] = [tenantId];
    const filters: string[] = ['tenant_id = $1'];

    if (query.status) {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }
    if (query.senderId) {
      params.push(query.senderId);
      filters.push(`source_addr = $${params.length}`);
    }
    if (query.providerId) {
      params.push(query.providerId);
      filters.push(`provider_id = $${params.length}`);
    }
    if (query.campaignId) {
      params.push(query.campaignId);
      filters.push(`campaign_id = $${params.length}`);
    }
    if (query.phoneNumber) {
      params.push(this.normalizePhoneNumber(query.phoneNumber));
      filters.push(`phone_number = $${params.length}`);
    }
    if (query.providerMessageId) {
      params.push(query.providerMessageId);
      filters.push(`provider_message_id = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      filters.push(`accepted_at >= $${params.length}::timestamptz`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`accepted_at <= $${params.length}::timestamptz`);
    }

    const countResult = await this.databaseService.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM messages
        WHERE ${filters.join(' AND ')}
      `,
      params,
    );

    const result = await this.databaseService.query<MessageRow>(
      `
        SELECT
          id,
          submit_date,
          tenant_id,
          campaign_id,
          api_key_id,
          client_message_id,
          api_idempotency_key,
          source_addr,
          phone_number,
          body,
          traffic_type,
          status,
          version,
          attempt_count,
          provider_id,
          smpp_config_id,
          route_rule_id,
          provider_message_id,
          price_minor,
          billing_state,
          message_parts,
          accepted_at,
          sent_at,
          delivered_at,
          failed_at,
          last_error_code,
          last_error_message
        FROM messages
        WHERE ${filters.join(' AND ')}
        ORDER BY accepted_at DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, query.limit, offset],
    );

    return {
      items: result.rows.map((row) => this.buildMessageResponse(row)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: Number(countResult.rows[0]?.total ?? 0),
      },
    };
  }

  async getMessageTrace(user: JwtClaims, messageRef: MessageCompositeId): Promise<Record<string, unknown>> {
    const tenantId = resolveTenantScope(user, messageRef.tenantId);
    const scopedRef = { ...messageRef, tenantId };
    const message = await this.getMessageRow(scopedRef);

    const [logs, ledger, webhooks] = await Promise.all([
      this.databaseService.query<{
        event_type: string;
        status_from: string | null;
        status_to: string | null;
        provider_id: number | null;
        provider_message_id: string | null;
        attempt_no: number;
        payload: Record<string, unknown>;
        created_at: string;
      }>(
        `
          SELECT event_type, status_from, status_to, provider_id, provider_message_id, attempt_no, payload, created_at
          FROM message_logs
          WHERE tenant_id = $1
            AND message_submit_date = $2
            AND message_id = $3
          ORDER BY created_at ASC
        `,
        [tenantId, scopedRef.submitDate, scopedRef.id],
      ),
      this.databaseService.query<{
        kind: string;
        amount_minor: number;
        currency: string;
        balance_before_minor: number;
        balance_after_minor: number;
        idempotency_key: string;
        created_at: string;
        metadata: Record<string, unknown>;
      }>(
        `
          SELECT kind, amount_minor, currency, balance_before_minor, balance_after_minor, idempotency_key, created_at, metadata
          FROM transactions
          WHERE tenant_id = $1
            AND message_submit_date = $2
            AND message_id = $3
          ORDER BY created_at ASC
        `,
        [tenantId, scopedRef.submitDate, scopedRef.id],
      ),
      this.databaseService.query<{
        id: number;
        normalized_status: string | null;
        processed: boolean;
        processing_error: string | null;
        received_at: string;
        processed_at: string | null;
        payload: Record<string, unknown>;
      }>(
        `
          SELECT id, normalized_status, processed, processing_error, received_at, processed_at, payload
          FROM dlr_webhooks
          WHERE provider_id = $1
            AND ($2::uuid IS NULL OR tenant_id = $2)
            AND provider_message_id = $3
          ORDER BY received_at DESC
          LIMIT 20
        `,
        [message.provider_id, tenantId, message.provider_message_id],
      ),
    ]);

    return {
      message: this.buildMessageResponse(message),
      correlation: {
        clientMessageId: message.client_message_id,
        apiIdempotencyKey: message.api_idempotency_key,
        providerMessageId: message.provider_message_id,
        routeRuleId: message.route_rule_id,
        smppConfigId: message.smpp_config_id,
        version: message.version,
      },
      timeline: logs.rows.map((row) => ({
        eventType: row.event_type,
        statusFrom: row.status_from,
        statusTo: row.status_to,
        providerId: row.provider_id,
        providerMessageId: row.provider_message_id,
        attemptNo: row.attempt_no,
        payload: row.payload,
        createdAt: row.created_at,
      })),
      billing: ledger.rows.map((row) => ({
        kind: row.kind,
        amountMinor: row.amount_minor,
        currency: row.currency,
        balanceBeforeMinor: row.balance_before_minor,
        balanceAfterMinor: row.balance_after_minor,
        idempotencyKey: row.idempotency_key,
        createdAt: row.created_at,
        metadata: row.metadata,
      })),
      dlrHistory: webhooks.rows.map((row) => ({
        id: row.id,
        normalizedStatus: row.normalized_status,
        processed: row.processed,
        processingError: row.processing_error,
        receivedAt: row.received_at,
        processedAt: row.processed_at,
        payload: row.payload,
      })),
      routingDecision: {
        providerId: message.provider_id,
        smppConfigId: message.smpp_config_id,
        routeRuleId: message.route_rule_id,
        priceMinor: message.price_minor,
        billingState: message.billing_state,
        attemptCount: message.attempt_count,
        lastErrorCode: message.last_error_code,
        lastErrorMessage: message.last_error_message,
      },
    };
  }

  async correlateMessageForDlr(input: {
    tenantId?: string;
    providerId: number;
    providerMessageId?: string;
    phoneNumber?: string;
    senderId?: string;
    eventAt?: string;
    bodyHash?: string;
    campaignId?: number;
    routeRuleId?: number;
  }): Promise<MessageRow | null> {
    if (input.providerMessageId) {
      const direct = await this.databaseService.query<MessageRow>(
        `
          SELECT
            id, submit_date, tenant_id, campaign_id, api_key_id, client_message_id, api_idempotency_key, source_addr,
            phone_number, body, traffic_type, status, version, attempt_count, provider_id, smpp_config_id,
            route_rule_id, provider_message_id, price_minor, billing_state, message_parts, accepted_at,
            sent_at, delivered_at, failed_at, last_error_code, last_error_message, body_hash
        FROM messages
        WHERE provider_id = $1
          AND ($3::uuid IS NULL OR tenant_id = $3)
          AND provider_message_id = $2
        ORDER BY sent_at DESC NULLS LAST
        LIMIT 1
      `,
        [input.providerId, input.providerMessageId, input.tenantId ?? null],
      );
      if (direct.rows[0]) {
        return direct.rows[0];
      }
    }

    if (!input.phoneNumber) {
      return null;
    }

    const fallback = await this.databaseService.query<(MessageRow & { confidence_score: string })>(
      `
        SELECT
          id, submit_date, tenant_id, campaign_id, api_key_id, client_message_id, api_idempotency_key, source_addr,
          phone_number, body, traffic_type, status, version, attempt_count, provider_id, smpp_config_id,
          route_rule_id, provider_message_id, price_minor, billing_state, message_parts, accepted_at,
          sent_at, delivered_at, failed_at, last_error_code, last_error_message, body_hash,
          (
            CASE
              WHEN $4::varchar IS NOT NULL AND source_addr = $4 THEN 3
              ELSE 0
            END
            +
            CASE
              WHEN $6::varchar IS NOT NULL AND body_hash = $6 THEN 6
              ELSE 0
            END
            +
            CASE
              WHEN $7::bigint IS NOT NULL AND campaign_id = $7 THEN 4
              ELSE 0
            END
            +
            CASE
              WHEN $8::bigint IS NOT NULL AND route_rule_id = $8 THEN 4
              ELSE 0
            END
            +
            CASE
              WHEN $5::timestamptz IS NOT NULL AND sent_at IS NOT NULL
                AND ABS(EXTRACT(EPOCH FROM (sent_at - $5::timestamptz))) <= 900 THEN 3
              WHEN $5::timestamptz IS NOT NULL AND sent_at IS NOT NULL
                AND ABS(EXTRACT(EPOCH FROM (sent_at - $5::timestamptz))) <= 21600 THEN 1
              ELSE 0
            END
          )::text AS confidence_score
        FROM messages
        WHERE provider_id = $1
          AND ($2::uuid IS NULL OR tenant_id = $2)
          AND phone_number = $3
          AND sent_at >= COALESCE($5::timestamptz - interval '6 hours', now() - interval '24 hours')
          AND sent_at <= COALESCE($5::timestamptz + interval '6 hours', now())
        ORDER BY CAST((
            CASE
              WHEN $4::varchar IS NOT NULL AND source_addr = $4 THEN 3
              ELSE 0
            END
            +
            CASE
              WHEN $6::varchar IS NOT NULL AND body_hash = $6 THEN 6
              ELSE 0
            END
            +
            CASE
              WHEN $7::bigint IS NOT NULL AND campaign_id = $7 THEN 4
              ELSE 0
            END
            +
            CASE
              WHEN $8::bigint IS NOT NULL AND route_rule_id = $8 THEN 4
              ELSE 0
            END
            +
            CASE
              WHEN $5::timestamptz IS NOT NULL AND sent_at IS NOT NULL
                AND ABS(EXTRACT(EPOCH FROM (sent_at - $5::timestamptz))) <= 900 THEN 3
              WHEN $5::timestamptz IS NOT NULL AND sent_at IS NOT NULL
                AND ABS(EXTRACT(EPOCH FROM (sent_at - $5::timestamptz))) <= 21600 THEN 1
              ELSE 0
            END
          ) AS INTEGER) DESC,
          sent_at DESC NULLS LAST
        LIMIT 5
      `,
      [
        input.providerId,
        input.tenantId ?? null,
        input.phoneNumber,
        input.senderId ?? null,
        input.eventAt ?? null,
        input.bodyHash ?? null,
        input.campaignId ?? null,
        input.routeRuleId ?? null,
      ],
    );

    const ranked = fallback.rows.map((row) => ({
      row,
      confidence: Number(row.confidence_score),
    }));
    const best = ranked[0];
    const runnerUp = ranked[1];

    if (!best) {
      return null;
    }

    if (best.confidence < 4) {
      return null;
    }

    if (runnerUp && runnerUp.confidence === best.confidence) {
      return null;
    }

    return best.row;
  }
}
