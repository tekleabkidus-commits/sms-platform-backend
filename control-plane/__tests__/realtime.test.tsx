import { act, renderHook } from '@testing-library/react';
import { buildRealtimeInterval, useRealtimeStatus } from '@/lib/realtime';

describe('realtime helpers', () => {
  it('backs off polling after failures and stops polling when offline', () => {
    const interval = buildRealtimeInterval(15_000);

    expect(interval({ state: {} })).toBe(15_000);
    expect(interval({ state: { error: new Error('boom'), fetchFailureCount: 2 } })).toBe(60_000);

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    expect(interval({ state: { error: new Error('offline'), fetchFailureCount: 4 } })).toBe(false);

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('reports live/offline status changes for operational polling surfaces', () => {
    const query = {
      isRefetching: false,
      isError: false,
      dataUpdatedAt: Date.parse('2026-04-02T10:00:00.000Z'),
    };

    const { result } = renderHook(() => useRealtimeStatus(query as never));

    expect(result.current.stateLabel).toBe('Live');
    expect(result.current.lastUpdatedAt).toBe('2026-04-02T10:00:00.000Z');

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value: false,
      });
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.stateLabel).toBe('Offline');

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value: true,
      });
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.stateLabel).toBe('Live');
  });
});
