import { DlrProcessorService } from '../src/dlr/dlr.processor.service';
import { KafkaTopics } from '../src/kafka/kafka-topics';

describe('DlrProcessorService', () => {
  it('sends unmatched DLRs to reconciliation instead of dropping them', async () => {
    const txClient = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    const databaseService = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 1,
          received_date: '2026-04-02',
          provider_id: 9,
          tenant_id: null,
          provider_message_id: 'pmid-1',
          payload: { phoneNumber: '+251911234567' },
          normalized_status: 'delivered',
          processed: false,
        }],
      }),
      withTransaction: jest.fn().mockImplementation(async (callback: (ctx: { client: typeof txClient }) => Promise<unknown>) => callback({ client: txClient })),
    };
    const outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new DlrProcessorService(
      { subscribe: jest.fn().mockResolvedValue(undefined) } as never,
      databaseService as never,
      { correlateMessageForDlr: jest.fn().mockResolvedValue(null) } as never,
      outboxService as never,
      { hasCapability: jest.fn().mockReturnValue(true) } as never,
      { recordDlrEvent: jest.fn() } as never,
    );

    await (service as any).processWebhook('2026-04-02', 1, 9);

    expect(outboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        topicName: KafkaTopics.SmsReconcile,
        eventType: 'dlr.reconcile',
      }),
      expect.any(Object),
    );
  });

  it('marks duplicate delivered DLRs as processed idempotently', async () => {
    const databaseService = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            received_date: '2026-04-02',
            provider_id: 9,
            tenant_id: 'tenant-1',
            provider_message_id: 'pmid-1',
            payload: {},
            normalized_status: 'delivered',
            processed: false,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
      withTransaction: jest.fn(),
    };
    const service = new DlrProcessorService(
      { subscribe: jest.fn().mockResolvedValue(undefined) } as never,
      databaseService as never,
      {
        correlateMessageForDlr: jest.fn().mockResolvedValue({
          id: 100,
          submit_date: '2026-04-02',
          tenant_id: 'tenant-1',
          api_key_id: null,
          client_message_id: null,
          api_idempotency_key: null,
          source_addr: 'MYAPP',
          phone_number: '+251911234567',
          body: 'hello',
          traffic_type: 'transactional',
          status: 'delivered',
          version: 4,
          attempt_count: 1,
          provider_id: 9,
          smpp_config_id: 1,
          route_rule_id: 1,
          provider_message_id: 'pmid-1',
          price_minor: 10,
          billing_state: 'debited',
          message_parts: 1,
          accepted_at: '2026-04-02T00:00:00.000Z',
          sent_at: '2026-04-02T00:01:00.000Z',
          delivered_at: '2026-04-02T00:02:00.000Z',
          failed_at: null,
          last_error_code: null,
          last_error_message: null,
        }),
      } as never,
      { enqueue: jest.fn() } as never,
      { hasCapability: jest.fn().mockReturnValue(true) } as never,
      { recordDlrEvent: jest.fn() } as never,
    );

    await (service as any).processWebhook('2026-04-02', 1, 9);
    expect(databaseService.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE dlr_webhooks'),
      ['2026-04-02', 1, 'duplicate_delivered'],
    );
  });
});
