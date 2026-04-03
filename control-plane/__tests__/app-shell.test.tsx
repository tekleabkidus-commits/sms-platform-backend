import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '@/components/app-shell';
import { SessionData } from '@/lib/api-types';
import { logoutRequest, switchTenantRequest } from '@/lib/api';
import { SessionProvider } from '@/lib/session-context';

const replace = jest.fn();
const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    replace,
    refresh,
  }),
}));

jest.mock('@/lib/api', () => ({
  logoutRequest: jest.fn(),
  switchTenantRequest: jest.fn(),
}));

jest.mock('@/components/command-palette', () => ({
  CommandPalette: () => <div>Command palette</div>,
}));

jest.mock('@/components/notifications-center', () => ({
  NotificationsCenter: () => <div>Notifications center</div>,
}));

const baseSession: SessionData = {
  user: {
    id: 'user-1',
    email: 'admin@example.com',
    role: 'admin',
  },
  tenant: {
    id: 'tenant-1',
    code: 'tenant-one',
    name: 'Tenant One',
    timezone: 'Africa/Addis_Ababa',
    status: 'active',
  },
  availableTenants: [
    {
      id: 'tenant-1',
      code: 'tenant-one',
      name: 'Tenant One',
      timezone: 'Africa/Addis_Ababa',
      status: 'active',
    },
    {
      id: 'tenant-2',
      code: 'tenant-two',
      name: 'Tenant Two',
      timezone: 'Africa/Addis_Ababa',
      status: 'active',
    },
  ],
};

describe('AppShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows role-aware navigation and tenant switcher for admin users', () => {
    render(
      <SessionProvider session={baseSession}>
        <AppShell session={baseSession}>
          <div>Dashboard content</div>
        </AppShell>
      </SessionProvider>,
    );

    expect(screen.getByText(/providers/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tenant context switcher/i)).toBeInTheDocument();
  });

  it('switches tenant context through the auth route helper', async () => {
    const user = userEvent.setup();
    (switchTenantRequest as jest.Mock).mockResolvedValue(baseSession);

    render(
      <SessionProvider session={baseSession}>
        <AppShell session={baseSession}>
          <div>Dashboard content</div>
        </AppShell>
      </SessionProvider>,
    );

    await user.selectOptions(screen.getByLabelText(/tenant context switcher/i), 'tenant-2');

    expect(switchTenantRequest).toHaveBeenCalledWith({ tenantId: 'tenant-2' });
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
  });

  it('logs out through the auth helper', async () => {
    const user = userEvent.setup();
    (logoutRequest as jest.Mock).mockResolvedValue(undefined);

    render(
      <SessionProvider session={baseSession}>
        <AppShell session={baseSession}>
          <div>Dashboard content</div>
        </AppShell>
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(logoutRequest).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('shows the non-production environment badge when configured', () => {
    const previousEnv = process.env.NEXT_PUBLIC_APP_ENV;
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';

    render(
      <SessionProvider session={baseSession}>
        <AppShell session={baseSession}>
          <div>Dashboard content</div>
        </AppShell>
      </SessionProvider>,
    );

    expect(screen.getByText('staging')).toBeInTheDocument();

    process.env.NEXT_PUBLIC_APP_ENV = previousEnv;
  });
});
