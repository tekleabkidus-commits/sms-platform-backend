import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoutingAdminPage from '@/app/(app)/admin/routing/page';
import { useProvidersQuery, useRoutingRulesQuery } from '@/lib/hooks';
import { renderWithSession } from '@/test-utils';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/routing',
  useRouter: () => ({
    replace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/hooks', () => ({
  useRoutingRulesQuery: jest.fn(),
  useProvidersQuery: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('RoutingAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useProvidersQuery as jest.Mock).mockReturnValue({
      data: [{ id: 1, name: 'Ethio Telecom' }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    (useRoutingRulesQuery as jest.Mock).mockReturnValue({
      data: [
        {
          id: 10,
          name: 'OTP primary',
          countryCode: 'ET',
          trafficType: 'otp',
          providerId: 1,
          preferredProtocol: 'smpp',
          priority: 10,
          weight: 100,
          maxTps: 250,
          costRank: 1,
          failoverOrder: 1,
          isActive: true,
          updatedAt: '2026-04-02T10:00:00.000Z',
        },
        {
          id: 11,
          name: 'Marketing fallback',
          countryCode: 'ET',
          trafficType: 'marketing',
          providerId: 1,
          preferredProtocol: 'http',
          priority: 20,
          weight: 50,
          maxTps: 100,
          costRank: 2,
          failoverOrder: 2,
          isActive: false,
          updatedAt: '2026-04-02T11:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('renders routing rules in the shared DataGrid and syncs filter state to the URL', async () => {
    const user = userEvent.setup();
    renderWithSession(<RoutingAdminPage />);

    expect(screen.getByText('OTP primary')).toBeInTheDocument();
    expect(screen.getByText('Marketing fallback')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search/i), 'OTP');

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/admin/routing?search=OTP', { scroll: false });
    });

    expect(screen.getByText('OTP primary')).toBeInTheDocument();
    expect(screen.queryByText('Marketing fallback')).not.toBeInTheDocument();
  });
});
