'use client';

import { useEffect } from 'react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/primitives';
import { reportClientError } from '@/lib/request-events';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    reportClientError({
      source: 'global-error',
      message: error.message,
      requestId: error instanceof ApiError ? error.requestId : undefined,
      details: { digest: error.digest },
    });
  }, [error]);

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">Unexpected failure</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">The control plane hit an error.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{error.message}</p>
          {error instanceof ApiError && error.requestId ? (
            <p className="mt-2 text-xs font-medium text-slate-500">Request ID: {error.requestId}</p>
          ) : null}
          <div className="mt-6">
            <Button onClick={reset}>Try again</Button>
          </div>
        </div>
      </body>
    </html>
  );
}
