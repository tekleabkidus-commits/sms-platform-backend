'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { useGlobalSearchQuery } from '@/lib/hooks';
import { switchTenantRequest } from '@/lib/api';
import { Dialog } from './ui/dialog';
import { Button, Input } from './ui/primitives';

export function CommandPalette(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const search = useGlobalSearchQuery(deferredQuery);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const groups = useMemo(() => search.data?.groups ?? [], [search.data?.groups]);

  return (
    <>
      <Button type="button" variant="ghost" className="justify-start" onClick={() => setOpen(true)}>
        <Search className="size-4" />
        Search
        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Ctrl K</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        title="Global search"
        description="Search messages, campaigns, sender IDs, API keys, providers, and tenants from one operational lookup."
        size="lg"
      >
        <div className="space-y-4">
          <Input
            placeholder="Search by message ID, provider message ID, phone number, campaign, sender, tenant, provider, or API key"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {deferredQuery.trim().length < 2 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              Type at least two characters to search operational entities.
            </div>
          ) : search.isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Searching…</div>
          ) : search.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
              Search failed. Try again in a moment.
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No matching results were found for the current tenant context.
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.type} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{group.label}</p>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      item.action === 'switch-tenant' ? (
                        <button
                          key={item.id}
                          type="button"
                          className="flex w-full items-start justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                          onClick={async () => {
                            try {
                              const tenantId = String(item.actionPayload?.tenantId ?? '');
                              if (!tenantId) {
                                return;
                              }
                              await switchTenantRequest({ tenantId });
                              toast.success(`Switched tenant context to ${item.title}.`);
                              setOpen(false);
                              setQuery('');
                              router.replace('/dashboard');
                              router.refresh();
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : 'Unable to switch tenant');
                            }
                          }}
                        >
                          <span>
                            <span className="block font-medium text-slate-950">{item.title}</span>
                            <span className="mt-1 block text-sm text-slate-500">{item.subtitle}</span>
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Switch</span>
                        </button>
                      ) : (
                        <Link
                          key={item.id}
                          href={item.href ?? '/dashboard'}
                          className="flex items-start justify-between rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                          onClick={() => {
                            setOpen(false);
                            setQuery('');
                          }}
                        >
                          <span>
                            <span className="block font-medium text-slate-950">{item.title}</span>
                            <span className="mt-1 block text-sm text-slate-500">{item.subtitle}</span>
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{item.entityType.replaceAll('_', ' ')}</span>
                        </Link>
                      )
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
