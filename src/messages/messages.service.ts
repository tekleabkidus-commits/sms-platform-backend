import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthenticatedRequest } from '../auth/auth.types';
import { DatabaseService, TransactionContext } from '../database/database.service';
import { RateLimitService } from '../redis/rate-limit.service';
import { TemplatesService } from '../templates/templates.service';
import { RoutingService } from '../routing/routing.service';
import { SenderIdsService } from '../sender-ids/sender-ids.service';
import { FraudService } from '../fraud/fraud.service';
import { OutboxService } from '../outbox/outbox.service';
import { SubmitMessageDto } from './dto/submit-message.dto';
import { AllowedTransitions, MessageCompositeId, MessageStatus } from './messages.types';
import { KafkaTopics } from '../kafka/kafka-topics';

interface MessageRow {
  id: number;
  submit_date: string;
  tenant_id: string;
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

  private buildMessageResponse(row: MessageRow, routePreview?: Record<string, unknown>): Record<string, unknown> {
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

  private async getSellPriceMinor(tenantId: string, countryCode: string, trafficType: string, parts: number): Promise<number> {
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

  private async reserveWallet(
    tx: TransactionContext,
    tenantId: string,
    amountMinor: number,
    idempotencyKey: string,
    messageRef?: MessageCompositeId,
  ): Promise<void> {
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

    const availableWithCredit = wallet.available_balance_minor + wallet.credit_limit_minor;
    if (availableWithCredit < amountMinor) {
      throw new ForbiddenException('Insufficient wallet balance');
    }

    await tx.client.query(
      `
        UPDATE wallets
        SET available_balance_minor = available_balance_minor - $2,
            reserved_balance_minor = reserved_balance_minor + $2,
            version = version + 1,
            updated_at = now()
        WHERE tenant_id = $1
      `,
      [tenantId, amountMinor],
    );

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
          'reserve',
          $5,
          $6,
          $7,
          $8,
          $9,
          $10
        )
      `,
      [
        tenantId,
        wallet.id,
        messageRef?.submitDate ?? null,
        messageRef?.id ?? null,
        amountMinor,
        wallet.currency,
        wallet.available_balance_minor,
        wallet.available_balance_minor - amountMinor,
        idempotencyKey,
        JSON.stringify({ messageRef }),
      ],
    );
  }

  async debitReservedWallet(
    tx: TransactionContext,
    tenantId: string,
    amountMinor: number,
    idempotencyKey: string,
    messageRef: MessageCompositeId,
  ): Promise<void> {
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

    await tx.client.query(
      `
        UPDATE wallets
        SET reserved_balance_minor = GREATEST(0, reserved_balance_minor - $2),
            version = version + 1,
            updated_at = now()
        WHERE tenant_id = $1
      `,
      [tenantId, amountMinor],
    );

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
          'debit',
          $5,
          $6,
          $7,
          $8,
          $9,
          $10
        )
      `,
      [
        tenantId,
        wallet.id,
        messageRef.submitDate,
        messageRef.id,
        amountMinor,
        wallet.currency,
        wallet.reserved_balance_minor,
        Math.max(0, wallet.reserved_balance_minor - amountMinor),
        idempotencyKey,
        JSON.stringify({ messageRef }),
      ],
    );
  }

  async releaseReservedWallet(
    tx: TransactionContext,
    tenantId: string,
    amountMinor: number,
    idempotencyKey: string,
    messageRef: MessageCompositeId,
  ): Promise<void> {
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

    await tx.client.query(
      `
        UPDATE wallets
        SET available_balance_minor = available_balance_minor + $2,
            reserved_balance_minor = GREATEST(0, reserved_balance_minor - $2),
            version = version + 1,
            updated_at = now()
        WHERE tenant_id = $1
      `,
      [tenantId, amountMinor],
    );

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
          'release',
          $5,
          $6,
          $7,
          $8,
          $9,
          $10
        )
      `,
      [
        tenantId,
        wallet.id,
        messageRef.submitDate,
        messageRef.id,
        amountMinor,
        wallet.currency,
        wallet.reserved_balance_minor,
        Math.max(0, wallet.reserved_balance_minor - amountMinor),
        idempotencyKey,
        JSON.stringify({ messageRef }),
      ],
    );
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

    for (const [column, value] of Object.entries(fields)) {
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

    values.push(this.toDateString(message.submit_date), message.tenant_id, message.id, message.status, message.version);

    const sql = `
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
    `;

    const result = await tx.client.query<MessageRow>(sql, values);
    const updated = result.rows[0];
    if (!updated) {
      throw new ConflictException('Message version conflict');
    }

    return updated;
  }

  async submitMessage(request: AuthenticatedRequest, dto: SubmitMessageDto): Promise<Record<string, unknown>> {
    const principal = request.apiPrincipal;
    if (!principal) {
      throw new UnauthorizedException('API principal is missing');
    }
    if (!principal.scopes.includes('sms:send')) {
      throw new ForbiddenException('API key does not have sms:send scope');
    }

    const tenantPolicy = await this.getTenantPolicy(principal.tenantId);
    await this.rateLimitService.enforceLimit(`rl:tenant:${principal.tenantId}:api:${Math.floor(Date.now() / 1000)}`, tenantPolicy.api_rate_limit_rps, 1);
    if (principal.rateLimitRps) {
      await this.rateLimitService.enforceLimit(`rl:key:${principal.apiKeyId}:api:${Math.floor(Date.now() / 1000)}`, principal.rateLimitRps, 1);
    }

    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);
    const trafficType = dto.trafficType ?? 'transactional';
    let body = dto.body ?? '';
    if (!body && !dto.templateRef) {
      throw new BadRequestException('Either body or templateRef is required');
    }
    if (dto.templateRef) {
      const template = await this.templatesService.resolveTemplate(principal.tenantId, dto.templateRef);
      body = this.templatesService.render(template.body, dto.mergeData);
    }

    const routePreview = await this.routingService.selectRoute(principal.tenantId, phoneNumber, trafficType);
    await this.senderIdsService.ensureApproved(principal.tenantId, dto.senderId, routePreview.providerId);
    await this.fraudService.enforceSubmission({
      tenantId: principal.tenantId,
      phoneNumber,
      body,
      senderId: dto.senderId,
      trafficType,
    });

    const messageParts = this.computeMessageParts(body);
    const countryCode = this.countryCodeFor(phoneNumber);
    const sellPriceMinor = await this.getSellPriceMinor(principal.tenantId, countryCode, trafficType, messageParts);
    const idempotencyKey = request.headers['x-idempotency-key']?.toString() ?? null;
    const bodyHash = createHash('sha256').update(body).digest('hex');

    return this.databaseService.withTransaction(async (tx) => {
      if (idempotencyKey) {
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
              AND api_idempotency_key = $2
            LIMIT 1
          `,
          [principal.tenantId, idempotencyKey],
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
          principal.tenantId,
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
          sellPriceMinor,
          routePreview.estimatedUnitCostMinor,
          JSON.stringify({
            mergeData: dto.mergeData ?? {},
            requestId: request.headers['x-request-id'],
          }),
          principal.apiKeyId,
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
        principal.tenantId,
        sellPriceMinor,
        `reserve:${principal.tenantId}:${idempotencyKey ?? bodyHash}`,
        composite,
      );

      await this.logEvent(
        tx,
        composite,
        'api_accepted',
        null,
        'accepted',
        {
          requestId: request.headers['x-request-id'],
          routePreview,
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
        },
      }, tx);

      return this.buildMessageResponse(message, routePreview as unknown as Record<string, unknown>);
    });
  }

  async correlateMessageForDlr(input: {
    providerId: number;
    providerMessageId?: string;
    phoneNumber?: string;
  }): Promise<MessageRow | null> {
    if (input.providerMessageId) {
      const direct = await this.databaseService.query<MessageRow>(
        `
          SELECT
            id, submit_date, tenant_id, api_key_id, client_message_id, api_idempotency_key, source_addr,
            phone_number, body, traffic_type, status, version, attempt_count, provider_id, smpp_config_id,
            route_rule_id, provider_message_id, price_minor, billing_state, message_parts, accepted_at,
            sent_at, delivered_at, failed_at, last_error_code, last_error_message
          FROM messages
          WHERE provider_id = $1
            AND provider_message_id = $2
          ORDER BY sent_at DESC NULLS LAST
          LIMIT 1
        `,
        [input.providerId, input.providerMessageId],
      );
      if (direct.rows[0]) {
        return direct.rows[0];
      }
    }

    if (!input.phoneNumber) {
      return null;
    }

    const fallback = await this.databaseService.query<MessageRow>(
      `
        SELECT
          id, submit_date, tenant_id, api_key_id, client_message_id, api_idempotency_key, source_addr,
          phone_number, body, traffic_type, status, version, attempt_count, provider_id, smpp_config_id,
          route_rule_id, provider_message_id, price_minor, billing_state, message_parts, accepted_at,
          sent_at, delivered_at, failed_at, last_error_code, last_error_message
        FROM messages
        WHERE provider_id = $1
          AND phone_number = $2
          AND sent_at >= now() - interval '24 hours'
        ORDER BY sent_at DESC NULLS LAST
        LIMIT 1
      `,
      [input.providerId, input.phoneNumber],
    );

    return fallback.rows[0] ?? null;
  }
}
