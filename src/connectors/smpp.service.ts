import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const smpp = require('smpp');
import { CircuitBreakerService } from '../redis/circuit-breaker.service';
import { RateLimitService } from '../redis/rate-limit.service';
import { SecretsService } from '../secrets/secrets.service';
import { DispatchResult } from './http-provider.service';

interface SmppSessionState {
  session: any;
  healthy: boolean;
  sessionKey: string;
  providerId: number;
  lastActivityAt: number;
  enquireTimer?: NodeJS.Timeout;
}

export interface SmppDispatchRequest {
  providerId: number;
  host: string;
  port: number;
  systemId: string;
  passwordRef: string;
  maxSessions: number;
  sessionTps: number;
  sourceAddr: string;
  destinationAddr: string;
  shortMessage: string;
}

@Injectable()
export class SmppConnectorService {
  private readonly logger = new Logger(SmppConnectorService.name);
  private readonly sessions = new Map<string, SmppSessionState>();
  private readonly enquireLinkSeconds: number;
  private readonly unknownOutcomeTimeoutMs: number;

  constructor(
    configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly rateLimitService: RateLimitService,
    private readonly secretsService: SecretsService,
  ) {
    this.enquireLinkSeconds = configService.getOrThrow<number>('providers.smppEnquireLinkSeconds');
    this.unknownOutcomeTimeoutMs = configService.getOrThrow<number>('providers.unknownOutcomeTimeoutMs');
  }

  private computeSessionSlot(destinationAddr: string, maxSessions: number): number {
    const normalized = destinationAddr.replace(/[^\d]/g, '');
    const safeSessions = Math.max(maxSessions, 1);
    let hash = 0;
    for (let index = 0; index < normalized.length; index += 1) {
      hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % safeSessions;
  }

  private getSessionKey(request: SmppDispatchRequest): string {
    const slot = this.computeSessionSlot(request.destinationAddr, request.maxSessions);
    return `${request.providerId}:${request.host}:${request.port}:${request.systemId}:${slot}`;
  }

  private startEnquireLink(state: SmppSessionState): void {
    if (state.enquireTimer) {
      clearInterval(state.enquireTimer);
    }

    state.enquireTimer = setInterval(() => {
      if (!state.healthy) {
        return;
      }

      try {
        state.session.enquire_link();
      } catch (error) {
        this.logger.warn(`SMPP enquire_link failed for ${state.sessionKey}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }, this.enquireLinkSeconds * 1000);
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
          password: this.secretsService.resolveSecret(request.passwordRef),
        },
        (pdu: any) => {
          if (pdu.command_status === 0) {
            state.healthy = true;
            this.startEnquireLink(state);
            resolve();
            return;
          }
          reject(new Error(`SMPP bind failed with status ${pdu.command_status}`));
        },
      );
    });

    session.on('close', async () => {
      state.healthy = false;
      if (state.enquireTimer) {
        clearInterval(state.enquireTimer);
      }
      this.sessions.delete(sessionKey);
      await this.circuitBreakerService.setState(request.providerId, 'half_open', this.enquireLinkSeconds, 'smpp_session_closed');
    });

    session.on('error', async (error: Error) => {
      state.healthy = false;
      if (state.enquireTimer) {
        clearInterval(state.enquireTimer);
      }
      this.sessions.delete(sessionKey);
      await this.circuitBreakerService.setState(request.providerId, 'open', this.enquireLinkSeconds, error.message);
    });

    this.sessions.set(sessionKey, state);
    return state;
  }

  async submitSm(request: SmppDispatchRequest): Promise<DispatchResult> {
    const state = await this.ensureSession(request);
    const throttlingKey = `rl:provider:${request.providerId}:session:${state.sessionKey}`;
    await this.rateLimitService.enforceLimit(throttlingKey, request.sessionTps, 1);

    const startedAt = Date.now();
    return new Promise<DispatchResult>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          accepted: false,
          errorCode: 'unknown_submit_outcome',
          errorMessage: 'SMPP submit result timed out',
          latencyMs: Date.now() - startedAt,
          uncertain: true,
        });
      }, this.unknownOutcomeTimeoutMs);

      state.session.submit_sm(
        {
          destination_addr: request.destinationAddr,
          source_addr: request.sourceAddr,
          short_message: request.shortMessage,
        },
        (pdu: any) => {
          clearTimeout(timeout);
          state.lastActivityAt = Date.now();
          if (pdu.command_status === 0) {
            resolve({
              accepted: true,
              providerMessageId: pdu.message_id,
              rawResponse: pdu,
              latencyMs: Date.now() - startedAt,
            });
            return;
          }

          resolve({
            accepted: false,
            errorCode: pdu.command_status === 88 ? 'smpp_throttle' : `smpp_${pdu.command_status}`,
            errorMessage: 'SMPP submit_sm rejected',
            rawResponse: pdu,
            latencyMs: Date.now() - startedAt,
            retryable: pdu.command_status === 88,
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
