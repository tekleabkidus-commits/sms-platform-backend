import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtClaims } from '../auth/auth.types';
import { resolveTenantScope } from '../common/utils/tenant-scope';
import { DatabaseService } from '../database/database.service';
import { WalletTransactionsQueryDto } from './dto/wallet-transactions-query.dto';

@Injectable()
export class WalletsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getWalletSummary(user: JwtClaims, requestedTenantId?: string): Promise<Record<string, unknown>> {
    const tenantId = resolveTenantScope(user, requestedTenantId);
    const [wallet, recentTotals] = await Promise.all([
      this.databaseService.query<{
        id: number;
        currency: string;
        available_balance_minor: number;
        reserved_balance_minor: number;
        credit_limit_minor: number;
        low_balance_threshold_minor: number;
        updated_at: string;
      }>(
        `
          SELECT id, currency, available_balance_minor, reserved_balance_minor, credit_limit_minor, low_balance_threshold_minor, updated_at
          FROM wallets
          WHERE tenant_id = $1
          LIMIT 1
        `,
        [tenantId],
      ),
      this.databaseService.query<{
        reserved_today: string;
        debited_today: string;
        released_today: string;
      }>(
        `
          SELECT
            COALESCE(SUM(amount_minor) FILTER (WHERE kind = 'reserve'), 0)::text AS reserved_today,
            COALESCE(SUM(amount_minor) FILTER (WHERE kind = 'debit'), 0)::text AS debited_today,
            COALESCE(SUM(amount_minor) FILTER (WHERE kind = 'release'), 0)::text AS released_today
          FROM transactions
          WHERE tenant_id = $1
            AND created_at >= now() - interval '24 hours'
        `,
        [tenantId],
      ),
    ]);

    const walletRow = wallet.rows[0];
    if (!walletRow) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      id: walletRow.id,
      currency: walletRow.currency,
      availableBalanceMinor: walletRow.available_balance_minor,
      reservedBalanceMinor: walletRow.reserved_balance_minor,
      creditLimitMinor: walletRow.credit_limit_minor,
      lowBalanceThresholdMinor: walletRow.low_balance_threshold_minor,
      updatedAt: walletRow.updated_at,
      recentTotals: {
        reservedTodayMinor: Number(recentTotals.rows[0]?.reserved_today ?? 0),
        debitedTodayMinor: Number(recentTotals.rows[0]?.debited_today ?? 0),
        releasedTodayMinor: Number(recentTotals.rows[0]?.released_today ?? 0),
      },
    };
  }

  async listTransactions(
    user: JwtClaims,
    query: WalletTransactionsQueryDto,
    requestedTenantId?: string,
  ): Promise<Record<string, unknown>> {
    const tenantId = resolveTenantScope(user, requestedTenantId);
    const offset = (query.page - 1) * query.limit;
    const params: unknown[] = [tenantId];
    const filters: string[] = ['tenant_id = $1'];

    if (query.kind) {
      params.push(query.kind);
      filters.push(`kind = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      filters.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (query.to) {
      params.push(query.to);
      filters.push(`created_at <= $${params.length}::timestamptz`);
    }
    if (query.campaignId) {
      params.push(query.campaignId);
      filters.push(`campaign_id = $${params.length}`);
    }
    if (query.messageId) {
      params.push(query.messageId);
      filters.push(`message_id = $${params.length}`);
    }
    if (query.providerId) {
      params.push(query.providerId);
      filters.push(`provider_id = $${params.length}`);
    }

    const [countResult, transactions] = await Promise.all([
      this.databaseService.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM transactions
          WHERE ${filters.join(' AND ')}
        `,
        params,
      ),
      this.databaseService.query<{
        ledger_date: string;
        id: number;
        wallet_id: number;
        kind: string;
        amount_minor: number;
        currency: string;
        balance_before_minor: number;
        balance_after_minor: number;
        idempotency_key: string;
        message_submit_date: string | null;
        message_id: number | null;
        campaign_id: number | null;
        provider_id: number | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `
          SELECT
            ledger_date,
            id,
            wallet_id,
            kind,
            amount_minor,
            currency,
            balance_before_minor,
            balance_after_minor,
            idempotency_key,
            message_submit_date,
            message_id,
            campaign_id,
            provider_id,
            metadata,
            created_at
          FROM transactions
          WHERE ${filters.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT $${params.length + 1}
          OFFSET $${params.length + 2}
        `,
        [...params, query.limit, offset],
      ),
    ]);

    return {
      items: transactions.rows.map((row) => ({
        ledgerDate: row.ledger_date,
        id: row.id,
        walletId: row.wallet_id,
        kind: row.kind,
        amountMinor: row.amount_minor,
        currency: row.currency,
        balanceBeforeMinor: row.balance_before_minor,
        balanceAfterMinor: row.balance_after_minor,
        idempotencyKey: row.idempotency_key,
        messageSubmitDate: row.message_submit_date,
        messageId: row.message_id,
        campaignId: row.campaign_id,
        providerId: row.provider_id,
        metadata: row.metadata,
        createdAt: row.created_at,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: Number(countResult.rows[0]?.total ?? 0),
      },
    };
  }
}
