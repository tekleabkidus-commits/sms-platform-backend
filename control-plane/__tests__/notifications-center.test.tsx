import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsCenter } from '@/components/notifications-center';
import { useNotificationsQuery } from '@/lib/hooks';
import { renderWithSession, baseSession } from '@/test-utils';

jest.mock('@/lib/hooks', () => ({
  useNotificationsQuery: jest.fn(),
}));

const notifications = [
  {
    id: 'wallet-low-balance:tenant-1',
    severity: 'critical' as const,
    title: 'Wallet balance is below threshold',
    details: 'Available balance is low.',
    createdAt: '2026-04-02T10:00:00.000Z',
    href: '/wallet',
    category: 'wallet',
    tenantId: 'tenant-1',
  },
  {
    id: 'campaign-job-failed:1',
    severity: 'warning' as const,
    title: 'Campaign job failed',
    details: 'Shard failed.',
    createdAt: '2026-04-02T10:05:00.000Z',
    href: '/campaigns/1',
    category: 'campaigns',
    tenantId: 'tenant-1',
  },
];

describe('NotificationsCenter', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
    (useNotificationsQuery as jest.Mock).mockReturnValue({
      data: { items: notifications },
      isLoading: false,
      isError: false,
    });
  });

  it('migrates legacy read state and keeps it tenant scoped', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'sms-cp:notifications:read:v1:user-1:tenant-1',
      JSON.stringify(['wallet-low-balance:tenant-1']),
    );

    const { unmount } = renderWithSession(<NotificationsCenter />);

    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open notifications center/i }));
    expect(screen.getByText(/campaign job failed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark read/i })).toBeInTheDocument();
    unmount();

    const otherTenantSession = {
      ...baseSession,
      tenant: {
        ...baseSession.tenant,
        id: 'tenant-2',
        code: 'tenant-two',
        name: 'Tenant Two',
      },
    };

    renderWithSession(<NotificationsCenter />, otherTenantSession);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('marks notifications as read and persists the versioned envelope', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithSession(<NotificationsCenter />);

    await user.click(screen.getByRole('button', { name: /open notifications center/i }));
    await user.click(screen.getByRole('button', { name: /mark all read/i }));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('sms-cp:notifications:read:v2:user-1:tenant-1') ?? 'null');
      expect(stored.version).toBe(2);
      expect(stored.value).toEqual([
        'wallet-low-balance:tenant-1',
        'campaign-job-failed:1',
      ]);
    });

    unmount();
    renderWithSession(<NotificationsCenter />);
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });
});
