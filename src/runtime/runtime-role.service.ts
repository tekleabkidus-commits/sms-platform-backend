import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AppRole =
  | 'all'
  | 'api'
  | 'worker-dispatch'
  | 'worker-dlr'
  | 'worker-outbox'
  | 'worker-campaign'
  | 'worker-fraud'
  | 'worker-reconciliation';

export type RuntimeCapability =
  | 'http'
  | 'messageWorkflow'
  | 'dlrProcessor'
  | 'outboxRelay'
  | 'campaignScheduler'
  | 'fraudConsumers'
  | 'reconciliationConsumer';

const ROLE_CAPABILITIES: Record<AppRole, RuntimeCapability[]> = {
  all: [
    'http',
    'messageWorkflow',
    'dlrProcessor',
    'outboxRelay',
    'campaignScheduler',
    'fraudConsumers',
    'reconciliationConsumer',
  ],
  api: ['http'],
  'worker-dispatch': ['http', 'messageWorkflow'],
  'worker-dlr': ['http', 'dlrProcessor'],
  'worker-outbox': ['http', 'outboxRelay'],
  'worker-campaign': ['http', 'campaignScheduler'],
  'worker-fraud': ['http', 'fraudConsumers'],
  'worker-reconciliation': ['http', 'reconciliationConsumer'],
};

@Injectable()
export class RuntimeRoleService {
  private readonly role: AppRole;
  private readonly environment: string;

  constructor(private readonly configService: ConfigService) {
    this.role = this.configService.getOrThrow<AppRole>('app.role');
    this.environment = this.configService.getOrThrow<string>('app.environment');
  }

  getRole(): AppRole {
    return this.role;
  }

  getEnvironment(): string {
    return this.environment;
  }

  isProductionLike(): boolean {
    return ['production', 'staging'].includes(this.environment);
  }

  hasCapability(capability: RuntimeCapability): boolean {
    return ROLE_CAPABILITIES[this.role].includes(capability);
  }

  isApiRole(): boolean {
    return this.hasCapability('http') && this.role === 'api';
  }

  describeCapabilities(): RuntimeCapability[] {
    return [...ROLE_CAPABILITIES[this.role]];
  }
}
