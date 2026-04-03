import { act, renderHook } from '@testing-library/react';
import { useSavedViews } from '@/lib/saved-views';
import { SessionProvider } from '@/lib/session-context';
import { baseSession } from '@/test-utils';

describe('useSavedViews', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  function buildWrapper(session = baseSession) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <SessionProvider session={session}>{children}</SessionProvider>;
    };
  }

  it('migrates legacy saved views into the versioned tenant-scoped store', () => {
    window.localStorage.setItem(
      'sms-cp:saved-views:v1:user-1:tenant-1:audit',
      JSON.stringify([
        {
          id: 'view-1',
          name: 'Wallet actions',
          filters: { action: 'wallet.debit', page: '1', limit: '25' },
          isDefault: true,
          createdAt: '2026-04-02T10:00:00.000Z',
          updatedAt: '2026-04-02T10:00:00.000Z',
        },
      ]),
    );

    const { result } = renderHook(() => useSavedViews('audit'), { wrapper: buildWrapper() });

    expect(result.current.views).toHaveLength(1);
    expect(result.current.defaultView?.name).toBe('Wallet actions');

    const stored = JSON.parse(window.localStorage.getItem('sms-cp:saved-views:v2:user-1:tenant-1:audit') ?? 'null');
    expect(stored.version).toBe(2);
    expect(stored.value[0].name).toBe('Wallet actions');
  });

  it('keeps saved views isolated by tenant, user, and page key', () => {
    const { result } = renderHook(() => useSavedViews('audit'), { wrapper: buildWrapper() });

    act(() => {
      result.current.saveView('Ops default', { action: 'auth.login', page: '1', limit: '25' }, true);
    });

    const otherUser = {
      ...baseSession,
      user: {
        ...baseSession.user,
        id: 'user-2',
      },
    };
    const otherTenant = {
      ...baseSession,
      tenant: {
        ...baseSession.tenant,
        id: 'tenant-2',
      },
    };

    const { result: otherUserResult } = renderHook(() => useSavedViews('audit'), { wrapper: buildWrapper(otherUser) });
    const { result: otherTenantResult } = renderHook(() => useSavedViews('audit'), { wrapper: buildWrapper(otherTenant) });
    const { result: otherPageResult } = renderHook(() => useSavedViews('campaigns'), { wrapper: buildWrapper() });

    expect(otherUserResult.current.views).toHaveLength(0);
    expect(otherTenantResult.current.views).toHaveLength(0);
    expect(otherPageResult.current.views).toHaveLength(0);
  });

  it('recovers cleanly from corrupted saved-view storage', () => {
    window.localStorage.setItem('sms-cp:saved-views:v2:user-1:tenant-1:audit', '{bad-json');

    const { result } = renderHook(() => useSavedViews('audit'), { wrapper: buildWrapper() });

    expect(result.current.views).toEqual([]);
    expect(window.localStorage.getItem('sms-cp:saved-views:v2:user-1:tenant-1:audit')).toBeNull();
  });
});
