export const AUTH_REQUIRED_EVENT = 'sms-cp:auth-required';
export const AUTH_FORBIDDEN_EVENT = 'sms-cp:auth-forbidden';
export const CLIENT_ERROR_EVENT = 'sms-cp:client-error';

export function reportClientError(input: {
  source: string;
  message: string;
  requestId?: string;
  details?: unknown;
}): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLIENT_ERROR_EVENT, { detail: input }));
  }

  if (process.env.NODE_ENV !== 'production') {
    // Keep the browser console useful for local debugging without exposing stack traces in the UI.
    console.error(`[${input.source}] ${input.message}`, input.details ?? null);
  }
}
