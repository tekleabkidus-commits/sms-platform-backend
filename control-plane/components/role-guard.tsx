'use client';

import Link from 'next/link';
import { Role } from '@/lib/api-types';
import { useSessionData } from '@/lib/session-context';

export function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[];
  children: React.ReactNode;
}): React.ReactElement {
  const session = useSessionData();

  if (!allowedRoles.includes(session.user.role)) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Restricted route</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-950">This section is not available for your role.</h2>
        <p className="mt-3 text-sm text-slate-600">
          The control plane is enforcing the backend RBAC model for this page.
        </p>
        <Link href="/unauthorized" className="mt-5 inline-flex rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white">
          View access guidance
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
