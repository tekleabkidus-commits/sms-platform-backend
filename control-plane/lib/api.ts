'use client';

import { SessionData } from './api-types';
import { AUTH_FORBIDDEN_EVENT, AUTH_REQUIRED_EVENT } from './request-events';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === 'string' ? body : (body?.message ?? 'Request failed');
    const error = new ApiError(message, response.status, requestId, body);

    if (typeof window !== 'undefined') {
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, {
          detail: {
            message,
            requestId,
          },
        }));
      }

      if (response.status === 403) {
        window.dispatchEvent(new CustomEvent(AUTH_FORBIDDEN_EVENT, {
          detail: {
            message,
            requestId,
          },
        }));
      }
    }

    throw error;
  }

  return body as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(init.headers ?? {}),
    },
    credentials: 'same-origin',
  });

  return parseResponse<T>(response);
}

export async function loginRequest(input: {
  tenantCode: string;
  email: string;
  password: string;
}): Promise<SessionData> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'same-origin',
  });

  return parseResponse<SessionData>(response);
}

export async function logoutRequest(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  await parseResponse<{ success: true }>(response);
}

export async function switchTenantRequest(input: {
  tenantId: string;
}): Promise<SessionData> {
  const response = await fetch('/api/auth/switch-tenant', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'same-origin',
  });

  return parseResponse<SessionData>(response);
}

export async function reauthRequest(input: {
  password: string;
}): Promise<{ reauthToken: string; expiresInSeconds: number }> {
  const response = await fetch('/api/auth/re-auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'same-origin',
  });

  return parseResponse<{ reauthToken: string; expiresInSeconds: number }>(response);
}
