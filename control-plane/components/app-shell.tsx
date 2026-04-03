'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, ChevronRight, LogOut, ShieldCheck } from 'lucide-react';
import { CommandPalette } from '@/components/command-palette';
import { NotificationsCenter } from '@/components/notifications-center';
import { NAV_ITEMS, ROLE_LABELS, canAccess } from '@/lib/rbac';
import { SessionData } from '@/lib/api-types';
import { logoutRequest, switchTenantRequest } from '@/lib/api';
import { Button, Select, StatusBadge } from './ui/primitives';
import { cn } from '@/lib/utils';

export function AppShell({
  session,
  children,
}: {
  session: SessionData;
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#dff6ef_0%,#f8fafc_30%,#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-4 lg:px-6">
        <aside className="hidden w-72 shrink-0 flex-col rounded-[2rem] border border-slate-200/80 bg-slate-950 p-5 text-slate-100 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.7)] lg:flex">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-500/20 text-teal-200">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">SMS Platform</p>
                <h2 className="text-lg font-semibold">Control Plane</h2>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 size-5 text-teal-300" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{session.tenant.name}</p>
                  <p className="text-xs text-slate-400">{session.tenant.code}</p>
                  <p className="text-xs text-slate-400">{ROLE_LABELS[session.user.role]}</p>
                </div>
              </div>
            </div>
          </div>

          <nav className="mt-8 flex-1 space-y-1">
            {NAV_ITEMS.filter((item) => canAccess(session.user.role, item.roles)).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between rounded-2xl px-3 py-3 text-sm transition',
                    active ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-slate-900 hover:text-white',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="size-4" />
                    {item.label}
                  </span>
                  <ChevronRight className="size-4 opacity-60" />
                </Link>
              );
            })}
          </nav>

          <Button
            variant="ghost"
            className="justify-start bg-slate-900 text-slate-100 hover:bg-slate-800"
            onClick={async () => {
              await logoutRequest();
              router.replace('/login');
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col gap-5">
          <header className="rounded-[2rem] border border-slate-200/80 bg-white/90 px-5 py-4 shadow-[0_25px_80px_-55px_rgba(15,23,42,0.4)] backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Tenant context</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-xl font-semibold text-slate-950">{session.tenant.name}</h1>
                  <StatusBadge value={session.tenant.status} />
                  {process.env.NEXT_PUBLIC_APP_ENV && process.env.NEXT_PUBLIC_APP_ENV !== 'production' ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      {process.env.NEXT_PUBLIC_APP_ENV}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-3 lg:items-end">
                {(session.user.role === 'admin' || session.user.role === 'support') && session.availableTenants.length > 1 ? (
                  <div className="w-full min-w-60 lg:w-72">
                    <Select
                      aria-label="Tenant context switcher"
                      defaultValue={session.tenant.id}
                      onChange={async (event) => {
                        const tenantId = event.target.value;
                        if (!tenantId || tenantId === session.tenant.id) {
                          return;
                        }

                        await switchTenantRequest({ tenantId });
                        router.replace('/dashboard');
                        router.refresh();
                      }}
                    >
                      {session.availableTenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name} ({tenant.code})
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <CommandPalette />
                  <NotificationsCenter />
                  <div className="text-right text-sm text-slate-500">
                    <p>{session.user.email}</p>
                    <p>{session.tenant.timezone}</p>
                  </div>
                </div>
              </div>
            </div>
          </header>
          <main className="pb-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
