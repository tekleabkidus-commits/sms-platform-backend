import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextState {
  requestId: string;
  method?: string;
  path?: string;
  tenantId?: string | null;
  userId?: string | null;
  apiKeyId?: string | null;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextState>();

  run<T>(state: RequestContextState, callback: () => T): T {
    return this.storage.run(state, callback);
  }

  get(): RequestContextState | undefined {
    return this.storage.getStore();
  }

  update(patch: Partial<RequestContextState>): void {
    const current = this.storage.getStore();
    if (!current) {
      return;
    }

    Object.assign(current, patch);
  }
}
