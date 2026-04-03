import { ConflictException } from '@nestjs/common';
import { MessagesService } from '../src/messages/messages.service';

describe('MessagesService', () => {
  const buildService = (databaseQuery = jest.fn()) => new MessagesService(
    { query: databaseQuery } as never,
    { enforceLimit: jest.fn(), enforceDailyQuota: jest.fn() } as never,
    { resolveTemplate: jest.fn(), render: jest.fn() } as never,
    { selectRoute: jest.fn() } as never,
    { ensureApproved: jest.fn() } as never,
    { enforceSubmission: jest.fn() } as never,
    { enqueue: jest.fn() } as never,
    { write: jest.fn().mockResolvedValue(undefined) } as never,
    { assertNotOptedOut: jest.fn() } as never,
    {
      recordWalletOperation: jest.fn(),
      recordMessageTransition: jest.fn(),
      recordMessageSubmission: jest.fn(),
    } as never,
  );

  const message = {
    id: 100,
    submit_date: '2026-04-02',
    tenant_id: 'tenant-1',
    api_key_id: 'key-1',
    client_message_id: null,
    api_idempotency_key: null,
    source_addr: 'MYAPP',
    phone_number: '+251911234567',
    body: 'hello',
    traffic_type: 'transactional',
    status: 'accepted' as const,
    version: 1,
    attempt_count: 0,
    provider_id: null,
    smpp_config_id: null,
    route_rule_id: null,
    provider_message_id: null,
    price_minor: 10,
    billing_state: 'reserved',
    message_parts: 1,
    accepted_at: '2026-04-02T00:00:00.000Z',
    sent_at: null,
    delivered_at: null,
    failed_at: null,
    last_error_code: null,
    last_error_message: null,
  };

  it('throws on optimistic locking conflicts during guarded transitions', async () => {
    const tx = {
      client: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      },
    };
    const service = buildService();

    await expect(service.transitionMessage(tx as never, message, 'routed')).rejects.toThrow(ConflictException);
  });

  it('does not double-apply wallet operations for duplicate idempotency keys', async () => {
    const tx = {
      client: {
        query: jest.fn().mockResolvedValueOnce({ rows: [{ exists: true }] }),
      },
    };
    const service = buildService();

    await expect(
      service.reserveWallet(
        tx as never,
        'tenant-1',
        10,
        'reserve:tenant-1:2026-04-02:100',
        { submitDate: '2026-04-02', tenantId: 'tenant-1', id: 100 },
      ),
    ).resolves.toBe(false);
    expect(tx.client.query).toHaveBeenCalledTimes(1);
  });

  it('correlates DLR fallback matches only when confidence is high and unambiguous', async () => {
    const databaseQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...message,
            status: 'provider_accepted',
            provider_id: 9,
            route_rule_id: 2,
            campaign_id: 10,
            body_hash: 'hash-1',
            confidence_score: '13',
          },
        ],
      });
    const service = buildService(databaseQuery);

    await expect(service.correlateMessageForDlr({
      tenantId: 'tenant-1',
      providerId: 9,
      providerMessageId: 'missing',
      phoneNumber: '+251911234567',
      senderId: 'MYAPP',
      eventAt: '2026-04-02T00:10:00.000Z',
      bodyHash: 'hash-1',
      campaignId: 10,
      routeRuleId: 2,
    })).resolves.toMatchObject({
      id: 100,
      provider_id: 9,
    });
  });

  it('returns null for ambiguous DLR fallback matches', async () => {
    const databaseQuery = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          ...message,
          status: 'provider_accepted',
          provider_id: 9,
          route_rule_id: 2,
          campaign_id: 10,
          body_hash: 'hash-1',
          confidence_score: '7',
        },
        {
          ...message,
          id: 101,
          status: 'provider_accepted',
          provider_id: 9,
          route_rule_id: 2,
          campaign_id: 10,
          body_hash: 'hash-2',
          confidence_score: '7',
        },
      ],
    });
    const service = buildService(databaseQuery);

    await expect(service.correlateMessageForDlr({
      tenantId: 'tenant-1',
      providerId: 9,
      phoneNumber: '+251911234567',
      senderId: 'MYAPP',
      eventAt: '2026-04-02T00:10:00.000Z',
    })).resolves.toBeNull();
  });
});
