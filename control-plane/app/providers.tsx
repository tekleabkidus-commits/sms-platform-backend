'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { SessionWatch } from '@/components/session-watch';
import { SessionData } from '@/lib/api-types';
import { ApiError } from '@/lib/api';
import { SessionProvider } from '@/lib/session-context';

export function AppProviders({
  session,
  children,
}: {
  session: SessionData;
  children: React.ReactNode;
}): React.ReactElement {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiError && [401, 403].includes(error.status)) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        <SessionWatch />
        {children}
        <Toaster richColors position="top-right" />
      </SessionProvider>
    </QueryClientProvider>
  );
}
