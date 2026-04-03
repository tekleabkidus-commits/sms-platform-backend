'use client';

import { useEffect } from 'react';
import { RefreshCcw, ShieldAlert } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { reportClientError } from '@/lib/request-events';
import { Button } from './primitives';

export function ErrorPanel({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry?: () => unknown | Promise<unknown>;
}): React.ReactElement {
  const message = error instanceof Error ? error.message : 'An unexpected request failed.';
  const requestId = error instanceof ApiError ? error.requestId : undefined;

  useEffect(() => {
    reportClientError({
      source: 'error-panel',
      message,
      requestId,
      details: error,
    });
  }, [error, message, requestId]);

  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50/80 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-rose-100 p-3 text-rose-700">
          <ShieldAlert className="size-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">Request failed</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{message}</p>
            {requestId ? (
              <p className="mt-2 text-xs font-medium text-slate-500">Request ID: {requestId}</p>
            ) : null}
          </div>
          {onRetry ? (
            <Button type="button" variant="ghost" onClick={() => void onRetry()}>
              <RefreshCcw className="size-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
