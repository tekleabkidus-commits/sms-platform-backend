import { SmppConnectorService } from '../src/connectors/smpp.service';

describe('SmppConnectorService', () => {
  it('reports healthy and unhealthy session counts', () => {
    const service = new SmppConnectorService(
      {
        getOrThrow: jest.fn().mockImplementation((key: string) => {
          if (key === 'providers.smppEnquireLinkSeconds') {
            return 30;
          }
          return 5000;
        }),
      } as never,
      { setState: jest.fn() } as never,
      { enforceLimit: jest.fn() } as never,
      { resolveSecret: jest.fn().mockReturnValue('password') } as never,
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

  it('shards sessions across the configured pool size', () => {
    const service = new SmppConnectorService(
      {
        getOrThrow: jest.fn().mockImplementation((key: string) => {
          if (key === 'providers.smppEnquireLinkSeconds') {
            return 30;
          }
          return 5000;
        }),
      } as never,
      { setState: jest.fn() } as never,
      { enforceLimit: jest.fn() } as never,
      { resolveSecret: jest.fn().mockReturnValue('password') } as never,
    );

    const request = {
      providerId: 1,
      host: 'smpp.example.test',
      port: 2775,
      systemId: 'sys',
      passwordRef: 'env:SMPP_PASSWORD',
      maxSessions: 8,
      sessionTps: 50,
      sourceAddr: 'MYAPP',
      destinationAddr: '+251911234567',
      shortMessage: 'hello',
    };

    const sessionKey = (service as any).getSessionKey(request);
    expect(sessionKey.split(':')).toHaveLength(5);
  });
});
