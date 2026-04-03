'use client';

import Link from 'next/link';
import { Bell, BellDot } from 'lucide-react';
import { useState } from 'react';
import { useSessionData } from '@/lib/session-context';
import { useNotificationsQuery } from '@/lib/hooks';
import { loadNotificationReadIds, saveNotificationReadIds } from '@/lib/notifications-state';
import { Dialog } from './ui/dialog';
import { Button, StatusBadge } from './ui/primitives';
import { formatDateTime } from '@/lib/utils';

function severityTone(severity: 'info' | 'warning' | 'critical'): string {
  if (severity === 'critical') {
    return 'text-rose-700';
  }
  if (severity === 'warning') {
    return 'text-amber-700';
  }
  return 'text-slate-700';
}

export function NotificationsCenter(): React.ReactElement {
  const session = useSessionData();
  const scopeKey = `${session.user.id}:${session.tenant.id}`;

  return <NotificationsCenterInner key={scopeKey} />;
}

function NotificationsCenterInner(): React.ReactElement {
  const session = useSessionData();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => loadNotificationReadIds(session.user.id, session.tenant.id));
  const notifications = useNotificationsQuery();

  const persist = (nextReadIds: string[]) => {
    const deduped = [...new Set(nextReadIds)];
    setReadIds(deduped);
    saveNotificationReadIds(session.user.id, session.tenant.id, deduped);
  };

  const items = notifications.data?.items ?? [];
  const unreadCount = items.filter((item) => !readIds.includes(item.id)).length;

  return (
    <>
      <button
        type="button"
        aria-label="Open notifications center"
        className="relative inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        onClick={() => setOpen(true)}
      >
        {unreadCount > 0 ? <BellDot className="size-5" /> : <Bell className="size-5" />}
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        description="Provider degradation, campaign failures, backlog pressure, sender review results, wallet warnings, and policy alerts."
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}` : 'All alerts have been reviewed.'}
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={items.length === 0}
              onClick={() => persist(items.map((item) => item.id))}
            >
              Mark all read
            </Button>
          </div>
          {notifications.isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Loading alerts…</div>
          ) : notifications.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">The notifications feed could not be loaded right now.</div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">No active alerts are currently surfaced for this tenant context.</div>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {items.map((item) => {
                const isRead = readIds.includes(item.id);
                return (
                  <div key={item.id} className={`rounded-2xl border px-4 py-3 ${isRead ? 'border-slate-200 bg-white' : 'border-teal-200 bg-teal-50/50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <StatusBadge value={item.severity} />
                          <span className="text-xs font-medium text-slate-500">{formatDateTime(item.createdAt)}</span>
                        </div>
                        <div>
                          <p className={`font-semibold ${severityTone(item.severity)}`}>{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{item.details}</p>
                        </div>
                      </div>
                      {!isRead ? (
                        <Button type="button" variant="ghost" onClick={() => persist([...new Set([...readIds, item.id])])}>
                          Mark read
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <Link
                        href={item.href}
                        className="text-sm font-medium text-teal-700 hover:text-teal-600"
                        onClick={() => {
                          persist([...new Set([...readIds, item.id])]);
                          setOpen(false);
                        }}
                      >
                        Open alert target
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
