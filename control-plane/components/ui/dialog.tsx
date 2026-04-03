'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled'));
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel ? getFocusableElements(panel) : [];
    focusable[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }

      if (event.key === 'Tab' && panel) {
        const items = getFocusableElements(panel);
        if (items.length === 0) {
          return;
        }

        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const widthClass = size === 'sm' ? 'max-w-lg' : size === 'lg' ? 'max-w-4xl' : 'max-w-2xl';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/55 p-4 pt-[10vh] backdrop-blur-sm" role="presentation">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        className={cn(
          'relative z-[71] w-full rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_35px_120px_-50px_rgba(15,23,42,0.8)]',
          widthClass,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 id="dialog-title" className="text-xl font-semibold text-slate-950">{title}</h2>
            {description ? (
              <p id="dialog-description" className="text-sm leading-6 text-slate-600">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
