'use client';

import { WifiOff, RefreshCcw, Radio } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

export function LastUpdatedIndicator({
  lastUpdatedAt,
  stateLabel,
  isOnline,
}: {
  lastUpdatedAt?: string | null;
  stateLabel: string;
  isOnline: boolean;
}): React.ReactElement {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
      {!isOnline ? <WifiOff className="size-3.5 text-amber-600" /> : stateLabel === 'Refreshing' ? <RefreshCcw className="size-3.5 animate-spin text-teal-700" /> : <Radio className="size-3.5 text-emerald-600" />}
      <span>{stateLabel}</span>
      <span className="text-slate-400">•</span>
      <span>{lastUpdatedAt ? formatDateTime(lastUpdatedAt) : 'Waiting for first update'}</span>
    </div>
  );
}
