import { render, screen } from '@testing-library/react';
import { RoleGuard } from '@/components/role-guard';
import { SessionProvider } from '@/lib/session-context';
import { SessionData } from '@/lib/api-types';

const baseSession: SessionData = {
  user: {
    id: 'user-1',
    email: 'viewer@example.com',
    role: 'viewer',
  },
  tenant: {
    id: 'tenant-1',
    code: 'tenant-one',
    name: 'Tenant One',
    timezone: 'Africa/Addis_Ababa',
    status: 'active',
  },
  availableTenants: [],
};

describe('RoleGuard', () => {
  it('renders children for allowed roles', () => {
    render(
      <SessionProvider session={{ ...baseSession, user: { ...baseSession.user, role: 'admin' } }}>
        <RoleGuard allowedRoles={['admin']}>
          <div>Allowed content</div>
        </RoleGuard>
      </SessionProvider>,
    );

    expect(screen.getByText('Allowed content')).toBeInTheDocument();
  });

  it('renders the restricted state for disallowed roles', () => {
    render(
      <SessionProvider session={baseSession}>
        <RoleGuard allowedRoles={['admin']}>
          <div>Allowed content</div>
        </RoleGuard>
      </SessionProvider>,
    );

    expect(screen.queryByText('Allowed content')).not.toBeInTheDocument();
    expect(screen.getByText(/restricted route/i)).toBeInTheDocument();
  });
});
