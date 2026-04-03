'use client';

import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function CopyButton({
  value,
  label = 'Copy value',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full border border-slate-200 p-1.5 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
        className,
      )}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success('Copied to clipboard.');
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
