import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditPage from '@/app/(app)/audit/page';
import { useAuditLogsQuery } from '@/lib/hooks';
import { downloadCsv } from '@/lib/csv';
import { renderWithSession } from '@/test-utils';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/audit',
  useRouter: () => ({
    replace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/hooks', () => ({
  useAuditLogsQuery: jest.fn(),
}));

jest.mock('@/lib/saved-views', () => ({
  useSavedViews: () => ({
    views: [],
    defaultView: null,
    saveView: jest.fn(),
    removeView: jest.fn(),
    setDefaultView: jest.fn(),
  }),
}));

jest.mock('@/lib/csv', () => ({
  downloadCsv: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
  },
}));

describe('AuditPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuditLogsQuery as jest.Mock).mockReturnValue({
      data: {
        items: [
          {
            logDate: '2026-04-02',
            id: 1,
            tenantId: 'tenant-1',
            userId: 'user-1',
            apiKeyId: null,
            action: 'wallet.debit',
            targetType: 'wallet',
            targetId: 'wallet-1',
            sourceIp: '127.0.0.1',
            metadata: { amountMinor: 25 },
            createdAt: '2026-04-02T10:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 25,
          total: 1,
        },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('exports the current audit result set as CSV', async () => {
    const user = userEvent.setup();
    renderWithSession(<AuditPage />);

    await user.click(screen.getByRole('button', { name: /export csv/i }));

    expect(downloadCsv).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'audit-logs.csv',
    }));
  });

  it('persists filter changes into the URL-friendly query string', async () => {
    const user = userEvent.setup();
    renderWithSession(<AuditPage />);

    await user.type(screen.getByPlaceholderText('wallet.debit'), 'wallet.debit');
    await user.tab();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/audit?action=wallet.debit', { scroll: false });
    });
  });
});
