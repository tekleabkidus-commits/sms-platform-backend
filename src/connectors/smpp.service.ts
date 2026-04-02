import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const smpp = require('smpp');
import { CircuitBreakerService } from '../redis/circuit-breaker.service';
import { DispatchResult } from './http-provider.service';

interface SmppSessionState {
  session: any;
  healthy: boolean;
  sessionKey: string;
  providerId: number;
  lastActivityAt: number;
}

export interface SmppDispatchRequest {
  providerId: number;
  host: string;
  port: number;
  systemId: string;
  password: string;
  sourceAddr: string;
  destinationAddr: string;
  shortMessage: string;
}

@Injectable()
export class SmppConnectorService {
  private readonly logger = new Logger(SmppConnectorService.name);
  private readonly sessions = new Map<string, SmppSessionState>();
  private readonly enquireLinkSeconds: number;

  constructor(
    configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
    this.enquireLinkSeconds = configService.getOrThrow<number>('providers.smppEnquireLinkSeconds');
  }

  private getSessionKey(request: SmppDispatchRequest): string {
    return `${request.providerId}:${request.host}:${request.port}:${request.systemId}`;
  }

  async ensureSession(request: SmppDispatchRequest): Promise<SmppSessionState> {
    const sessionKey = this.getSessionKey(request);
    const existing = this.sessions.get(sessionKey);
    if (existing?.healthy) {
      return existing;
    }

    const session = smpp.connect({ url: `smpp://${request.host}:${request.port}` });
    const state: SmppSessionState = {
      session,
      healthy: false,
      sessionKey,
      providerId: request.providerId,
      lastActivityAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      session.bind_transceiver(
        {
          system_id: request.systemId,
          password: request.password,
        },
        (pdu: any) => {
          if (pdu.command_status === 0) {
            state.healthy = true;
            resolve();
            return;
          }
          reject(new Error(`SMPP bind failed with status ${pdu.command_status}`));
        },
      );
    });

    session.on('close', async () => {
      state.healthy = false;
      await this.circuitBreakerService.setState(request.providerId, 'half_open', this.enquireLinkSeconds);
    });

    session.on('error', async () => {
      state.healthy = false;
      await this.circuitBreakerService.setState(request.providerId, 'open', this.enquireLinkSeconds);
    });

    this.sessions.set(sessionKey, state);
    return state;
  }

  async submitSm(request: SmppDispatchRequest): Promise<DispatchResult> {
    const state = await this.ensureSession(request);
    return new Promise<DispatchResult>((resolve) => {
      state.session.submit_sm(
        {
          destination_addr: request.destinationAddr,
          source_addr: request.sourceAddr,
          short_message: request.shortMessage,
        },
        (pdu: any) => {
          state.lastActivityAt = Date.now();
          if (pdu.command_status === 0) {
            resolve({
              accepted: true,
              providerMessageId: pdu.message_id,
              rawResponse: pdu,
            });
            return;
          }

          resolve({
            accepted: false,
            errorCode: String(pdu.command_status),
            errorMessage: 'SMPP submit_sm rejected',
            rawResponse: pdu,
          });
        },
      );
    });
  }

  evaluateSessionHealth(providerId: number): { totalSessions: number; healthySessions: number } {
    const sessions = [...this.sessions.values()].filter((session) => session.providerId === providerId);
    return {
      totalSessions: sessions.length,
      healthySessions: sessions.filter((session) => session.healthy).length,
    };
  }
}
