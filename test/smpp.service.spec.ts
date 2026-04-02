import { SmppConnectorService } from '../src/connectors/smpp.service';

describe('SmppConnectorService', () => {
  it('reports healthy and unhealthy session counts', () => {
    const service = new SmppConnectorService(
      { getOrThrow: jest.fn().mockReturnValue(30) } as never,
      { setState: jest.fn() } as never,
    );

    (service as any).sessions.set('a', {
      providerId: 1,
      healthy: true,
      sessionKey: 'a',
      session: {},
      lastActivityAt: Date.now(),
    });
    (service as any).sessions.set('b', {
      providerId: 1,
      healthy: false,
      sessionKey: 'b',
      session: {},
      lastActivityAt: Date.now(),
    });

    expect(service.evaluateSessionHealth(1)).toEqual({
      totalSessions: 2,
      healthySessions: 1,
    });
  });
});
