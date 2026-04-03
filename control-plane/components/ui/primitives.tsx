import { cloneElement, isValidElement, useId } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className={cn('rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.25)] backdrop-blur', className)}>
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">{eyebrow}</p> : null}
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {description ? <p className="max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.ReactElement {
  return (
    <AppCard className="space-y-3 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      {hint ? <p className="text-sm text-slate-500">{hint}</p> : null}
    </AppCard>
  );
}

export function Button({
  className,
  variant = 'primary',
  loading = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}): React.ReactElement {
  const variants: Record<string, string> = {
    primary: 'bg-slate-950 text-white hover:bg-slate-800',
    secondary: 'bg-teal-600 text-white hover:bg-teal-500',
    ghost: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    danger: 'bg-rose-600 text-white hover:bg-rose-500',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2',
        variants[variant],
        className,
      )}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {props.children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus-visible:ring-teal-300',
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus-visible:ring-teal-300',
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>): React.ReactElement {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus-visible:ring-teal-300',
        props.className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const fieldId = useId();
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const child = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        ...((children as React.ReactElement<Record<string, unknown>>).props ?? {}),
        id: (children as React.ReactElement<Record<string, unknown>>).props.id ?? fieldId,
        'aria-describedby': (children as React.ReactElement<Record<string, unknown>>).props['aria-describedby'] ?? describedBy,
        'aria-invalid': error ? true : (children as React.ReactElement<Record<string, unknown>>).props['aria-invalid'],
      })
    : children;

  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {child}
      {hint ? <span id={hintId} className="text-xs text-slate-500">{hint}</span> : null}
      {error ? <span id={errorId} className="text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}

export function StatusBadge({ value }: { value: string | null | undefined }): React.ReactElement {
  const normalized = (value ?? 'unknown').toLowerCase();
  const tone = normalized.includes('deliver') || normalized === 'approved' || normalized === 'healthy' || normalized === 'closed'
    ? 'bg-emerald-100 text-emerald-800'
    : normalized.includes('fail') || normalized.includes('reject') || normalized === 'open' || normalized === 'down'
      ? 'bg-rose-100 text-rose-700'
      : normalized.includes('pending') || normalized.includes('queued') || normalized.includes('half')
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700';

  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>{value ?? 'unknown'}</span>;
}

export function DataTable({
  columns,
  rows,
  emptyMessage = 'No records found.',
}: {
  columns: string[];
  rows: React.ReactNode[][];
  emptyMessage?: string;
}): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 text-left font-semibold text-slate-600">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((cells, rowIndex) => (
                <tr key={rowIndex} className="align-top">
                  {cells.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="px-4 py-3 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}): React.ReactElement {
  return (
    <AppCard className="border-dashed text-center">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </AppCard>
  );
}

export function InlineLoader({ label }: { label?: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" />
      <span>{label ?? 'Loading...'}</span>
    </div>
  );
}
