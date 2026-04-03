'use client';

import { useEffect, useMemo, useState } from 'react';
import { UseQueryResult } from '@tanstack/react-query';

export function buildRealtimeInterval(baseMs: number, maxMs = 120_000) {
  return (query: { state: { error?: unknown; fetchFailureCount?: number } }): number | false => {
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      return false;
    }

    const failureCount = query.state.fetchFailureCount ?? 0;
    if (!query.state.error) {
      return baseMs;
    }

    return Math.min(maxMs, baseMs * (2 ** Math.min(failureCount, 4)));
  };
}

export function useRealtimeStatus<T>(query: UseQueryResult<T, unknown>) {
  const [isOnline, setIsOnline] = useState(() => (typeof window === 'undefined' ? true : window.navigator.onLine));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return useMemo(() => ({
    isOnline,
    isRefreshing: query.isRefetching,
    lastUpdatedAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null,
    stateLabel: !isOnline ? 'Offline'
      : query.isRefetching ? 'Refreshing'
      : query.isError ? 'Retrying'
      : 'Live',
  }), [isOnline, query.dataUpdatedAt, query.isError, query.isRefetching]);
}
