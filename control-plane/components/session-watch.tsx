'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { logoutRequest } from '@/lib/api';
import { AUTH_FORBIDDEN_EVENT, AUTH_REQUIRED_EVENT, CLIENT_ERROR_EVENT } from '@/lib/request-events';

function detailMessage(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value && 'message' in value && typeof value.message === 'string') {
    return value.message;
  }
  return fallback;
}

export function SessionWatch(): React.ReactElement | null {
  const router = useRouter();
  const redirectingRef = useRef(false);

  useEffect(() => {
    const handleAuthRequired = async (event: Event) => {
      if (redirectingRef.current) {
        return;
      }

      redirectingRef.current = true;
      const message = detailMessage((event as CustomEvent).detail, 'Your session expired. Please sign in again.');
      toast.error(message);

      try {
        await logoutRequest();
      } catch {
        // Ignore logout cleanup failures and still force a redirect.
      }

      router.replace('/login?reason=session-expired');
      router.refresh();
    };

    const handleForbidden = (event: Event) => {
      const message = detailMessage((event as CustomEvent).detail, 'You do not have permission for that action.');
      toast.error(message);
    };

    const handleClientError = (event: Event) => {
      const detail = (event as CustomEvent).detail as { message?: string; requestId?: string } | undefined;
      if (!detail?.message) {
        return;
      }

      toast.error(detail.requestId ? `${detail.message} (request ${detail.requestId})` : detail.message);
    };

    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    window.addEventListener(AUTH_FORBIDDEN_EVENT, handleForbidden);
    window.addEventListener(CLIENT_ERROR_EVENT, handleClientError);

    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
      window.removeEventListener(AUTH_FORBIDDEN_EVENT, handleForbidden);
      window.removeEventListener(CLIENT_ERROR_EVENT, handleClientError);
    };
  }, [router]);

  return null;
}
