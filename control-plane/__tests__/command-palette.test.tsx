import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '@/components/command-palette';
import { useGlobalSearchQuery } from '@/lib/hooks';
import { switchTenantRequest } from '@/lib/api';

const replace = jest.fn();
const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
    refresh,
  }),
}));

jest.mock('@/lib/hooks', () => ({
  useGlobalSearchQuery: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  switchTenantRequest: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (switchTenantRequest as jest.Mock).mockResolvedValue(undefined);
    (useGlobalSearchQuery as jest.Mock).mockImplementation((query: string) => ({
      data: query.trim().length >= 2 ? {
        groups: [
          {
            type: 'messages',
            label: 'Messages',
            items: [
              {
                id: 'message-1',
                entityType: 'message',
                title: 'Message #1',
                subtitle: '+251911234567 • delivered',
                href: '/messages/2026-04-02/tenant-1/1',
              },
            ],
          },
          {
            type: 'tenants',
            label: 'Tenants',
            items: [
              {
                id: 'tenant-2',
                entityType: 'tenant',
                title: 'Tenant Two',
                subtitle: 'tenant-two',
                action: 'switch-tenant',
                actionPayload: { tenantId: 'tenant-2' },
              },
            ],
          },
        ],
      } : { groups: [] },
      isLoading: false,
      isError: false,
    }));
  });

  it('opens with the keyboard shortcut and renders grouped search results', async () => {
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: /global search/i })).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/search by message id/i);
    fireEvent.change(input, { target: { value: 'me' } });

    expect(await screen.findByText('Messages')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /message #1/i })).toHaveAttribute('href', '/messages/2026-04-02/tenant-1/1');
    expect(screen.getByText('Tenants')).toBeInTheDocument();
  });

  it('switches tenant context from a tenant result without leaking other actions', async () => {
    const user = userEvent.setup();
    render(<CommandPalette />);

    await user.click(screen.getByRole('button', { name: /search/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by message id/i), { target: { value: 'tenant' } });
    await user.click(await screen.findByRole('button', { name: /tenant two/i }));

    await waitFor(() => {
      expect(switchTenantRequest).toHaveBeenCalledWith({ tenantId: 'tenant-2' });
      expect(replace).toHaveBeenCalledWith('/dashboard');
      expect(refresh).toHaveBeenCalled();
    });
  });
});
