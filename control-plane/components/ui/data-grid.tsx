'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Columns3, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './primitives';

export interface DataGridColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  accessor?: (row: T) => string | number | null | undefined;
  className?: string;
  hiddenByDefault?: boolean;
}

interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

function loadVisibleColumns<T>(
  columns: DataGridColumn<T>[],
  visibilityStorageKey?: string,
): Record<string, boolean> {
  const defaultVisibility = Object.fromEntries(
    columns.map((column) => [column.id, !column.hiddenByDefault]),
  );

  if (!visibilityStorageKey || typeof window === 'undefined') {
    return defaultVisibility;
  }

  const raw = window.localStorage.getItem(visibilityStorageKey);
  if (!raw) {
    return defaultVisibility;
  }

  try {
    const stored = JSON.parse(raw) as Record<string, boolean>;
    return {
      ...defaultVisibility,
      ...stored,
    };
  } catch {
    return defaultVisibility;
  }
}

function DataGridInner<T>({
  columns,
  data,
  getRowId,
  emptyMessage = 'No rows to display.',
  loading = false,
  error,
  pagination,
  visibilityStorageKey,
  localSort = true,
}: {
  columns: DataGridColumn<T>[];
  data: T[];
  getRowId: (row: T) => string | number;
  emptyMessage?: string;
  loading?: boolean;
  error?: React.ReactNode;
  pagination?: PaginationConfig;
  visibilityStorageKey?: string;
  localSort?: boolean;
}): React.ReactElement {
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    () => loadVisibleColumns(columns, visibilityStorageKey),
  );

  const persistVisibility = (next: Record<string, boolean>) => {
    setVisibleColumns(next);
    if (visibilityStorageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(visibilityStorageKey, JSON.stringify(next));
    }
  };

  const resolvedVisibility = useMemo(
    () => ({
      ...Object.fromEntries(columns.map((column) => [column.id, !column.hiddenByDefault])),
      ...visibleColumns,
    }),
    [columns, visibleColumns],
  );

  const activeColumns = useMemo(
    () => columns.filter((column) => resolvedVisibility[column.id] !== false),
    [columns, resolvedVisibility],
  );

  const rows = useMemo(() => {
    if (!localSort || !sort) {
      return data;
    }

    const targetColumn = columns.find((column) => column.id === sort.columnId);
    if (!targetColumn?.accessor) {
      return data;
    }

    return [...data].sort((left, right) => {
      const leftValue = targetColumn.accessor?.(left);
      const rightValue = targetColumn.accessor?.(right);
      const normalizedLeft = leftValue == null ? '' : String(leftValue).toLowerCase();
      const normalizedRight = rightValue == null ? '' : String(rightValue).toLowerCase();
      const comparison = normalizedLeft.localeCompare(normalizedRight, undefined, { numeric: true });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [columns, data, localSort, sort]);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          {pagination ? `Showing ${Math.min(pagination.total, ((pagination.page - 1) * pagination.pageSize) + data.length)} of ${pagination.total}` : `${data.length} rows`}
        </div>
        <details className="relative">
          <summary className="list-none">
            <Button type="button" variant="ghost">
              <Columns3 className="size-4" />
              Columns
            </Button>
          </summary>
          <div className="absolute right-0 z-20 mt-2 min-w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="space-y-2">
              {columns.map((column) => (
                <label key={column.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={resolvedVisibility[column.id] !== false}
                    onChange={(event) => persistVisibility({
                      ...resolvedVisibility,
                      [column.id]: event.target.checked,
                    })}
                  />
                  {column.header}
                </label>
              ))}
            </div>
          </div>
        </details>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {activeColumns.map((column) => {
                const sortable = Boolean(column.accessor);
                const activeSort = sort?.columnId === column.id ? sort.direction : null;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn('px-4 py-3 text-left font-semibold text-slate-600', column.className)}
                    aria-sort={activeSort === 'asc' ? 'ascending' : activeSort === 'desc' ? 'descending' : 'none'}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                        onClick={() => {
                          setSort((current) => {
                            if (!current || current.columnId !== column.id) {
                              return { columnId: column.id, direction: 'asc' };
                            }
                            return current.direction === 'asc'
                              ? { columnId: column.id, direction: 'desc' }
                              : null;
                          });
                        }}
                      >
                        {column.header}
                        {activeSort === 'asc' ? <ChevronUp className="size-4" /> : activeSort === 'desc' ? <ChevronDown className="size-4" /> : null}
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white [content-visibility:auto]">
            {loading ? (
              <tr>
                <td colSpan={activeColumns.length} className="px-4 py-12 text-center text-slate-500">
                  Loading table…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={activeColumns.length} className="px-4 py-8">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length} className="px-4 py-12 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={String(getRowId(row))} className="align-top">
                {activeColumns.map((column) => (
                  <td key={`${String(getRowId(row))}-${column.id}`} className={cn('px-4 py-3 text-slate-700', column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Page {pagination.page}</span>
            {pagination.onPageSizeChange ? (
              <select
                className="rounded-xl border border-slate-200 bg-white px-2 py-1"
                value={pagination.pageSize}
                onChange={(event) => pagination.onPageSizeChange?.(Number(event.target.value))}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DataGrid<T>(props: {
  columns: DataGridColumn<T>[];
  data: T[];
  getRowId: (row: T) => string | number;
  emptyMessage?: string;
  loading?: boolean;
  error?: React.ReactNode;
  pagination?: PaginationConfig;
  visibilityStorageKey?: string;
  localSort?: boolean;
}): React.ReactElement {
  const storageScopeKey = props.visibilityStorageKey ?? 'inline';
  return <DataGridInner key={storageScopeKey} {...props} />;
}
