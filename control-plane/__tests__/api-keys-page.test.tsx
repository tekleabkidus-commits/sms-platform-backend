import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApiKeysPage from '@/app/(app)/developer/api-keys/page';
import { useApiKeysQuery } from '@/lib/hooks';
import { renderWithSession } from '@/test-utils';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/developer/api-keys',
  useRouter: () => ({
    replace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/hooks', () => ({
  useApiKeysQuery: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ApiKeysPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useApiKeysQuery as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'key-1',
          keyPrefix: 'abc123',
          name: 'Primary key',
          scopes: ['sms:send'],
          rateLimitRps: 100,
          dailyQuota: 100000,
          isActive: true,
          lastUsedAt: '2026-04-02T09:30:00.000Z',
          createdAt: '2026-04-02T09:00:00.000Z',
        },
        {
          id: 'key-2',
          keyPrefix: 'def456',
          name: 'Legacy key',
          scopes: ['sms:send'],
          rateLimitRps: 50,
          dailyQuota: 50000,
          isActive: false,
          lastUsedAt: null,
          createdAt: '2026-04-01T09:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('filters the stronger DataGrid and syncs the search state into the URL', async () => {
    const user = userEvent.setup();
    renderWithSession(<ApiKeysPage />);

    expect(screen.getByText('Primary key')).toBeInTheDocument();
    expect(screen.getByText('Legacy key')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search/i), 'Legacy');

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/developer/api-keys?search=Legacy', { scroll: false });
    });
    expect(screen.queryByText('Primary key')).not.toBeInTheDocument();
    expect(screen.getByText('Legacy key')).toBeInTheDocument();
  });

  it('renders strong row actions inside the upgraded API-key grid', () => {
    renderWithSession(<ApiKeysPage />);

    expect(screen.getAllByRole('button', { name: 'Rotate' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(2);
  });
});
