import { OutboxRelayService } from '../src/outbox/outbox-relay.service';

describe('OutboxRelayService', () => {
  it('publishes pending events and marks them published', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              event_date: '2026-04-02',
              id: 1,
              topic_name: 'sms.accepted',
              partition_key: 'tenant-1',
              payload: { hello: 'world' },
              retry_count: 0,
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };

    const databaseService = {
      withTransaction: jest.fn().mockImplementation(async (callback: (arg: { client: typeof client }) => Promise<unknown>) => callback({ client })),
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
    };
    const kafkaService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(10),
    };

    const service = new OutboxRelayService(
      configService as never,
      databaseService as never,
      kafkaService as never,
    );

    await service.flushBatch();

    expect(kafkaService.publish).toHaveBeenCalledWith({
      topic: 'sms.accepted',
      messages: [{ key: 'tenant-1', value: JSON.stringify({ hello: 'world' }) }],
    });
    expect(databaseService.query).toHaveBeenCalled();
  });
});
