'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type FiltersRecord = Record<string, string>;

function normalizeFilters<T extends FiltersRecord>(defaults: T, searchParams: URLSearchParams): T {
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [key, searchParams.get(key) ?? defaults[key]]),
  ) as T;
}

export function useUrlFilters<T extends FiltersRecord>(defaults: T) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

  const initialFilters = useMemo(
    () => normalizeFilters(defaults, new URLSearchParams(searchString)),
    [defaults, searchString],
  );
  const [filters, setFilters] = useState<T>(initialFilters);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const toSearchParams = useCallback((values: T) => {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      const normalized = value.trim();
      if (normalized && normalized !== defaults[key]) {
        params.set(key, normalized);
      }
    });
    return params;
  }, [defaults]);

  const applyFilters = useCallback((values: T) => {
    setFilters(values);
    const params = toSearchParams(values);
    router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }, [pathname, router, toSearchParams]);

  const updateFilters = useCallback((updates: Partial<T>, options?: { apply?: boolean }) => {
    setFilters((current) => {
      const next = { ...current, ...updates } as T;
      if (options?.apply) {
        const params = toSearchParams(next);
        router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
      }
      return next;
    });
  }, [pathname, router, toSearchParams]);

  return {
    filters,
    queryString: toSearchParams(filters).toString(),
    applyFilters,
    updateFilters,
    resetFilters: () => applyFilters({ ...defaults }),
  };
}
