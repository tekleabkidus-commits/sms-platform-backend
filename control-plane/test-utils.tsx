import { render, RenderOptions } from '@testing-library/react';
import { SessionProvider } from '@/lib/session-context';
import { SessionData } from '@/lib/api-types';

export const baseSession: SessionData = {
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

export function renderWithSession(
  ui: React.ReactElement,
  session: SessionData = baseSession,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(<SessionProvider session={session}>{ui}</SessionProvider>, options);
}
