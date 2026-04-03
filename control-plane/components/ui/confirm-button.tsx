'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { reauthRequest } from '@/lib/api';
import { Dialog } from './dialog';
import { Button, Field, Input } from './primitives';

export function ConfirmButton({
  title = 'Confirm action',
  confirmText,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  requireText,
  requireReauth = false,
  reauthLabel = 'Password confirmation',
  beforeOpen,
  onConfirm,
  variant,
  children,
}: {
  title?: string;
  confirmText: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  requireText?: string;
  requireReauth?: boolean;
  reauthLabel?: string;
  beforeOpen?: () => Promise<boolean> | boolean;
  onConfirm: (context?: { reauthToken?: string }) => Promise<void> | void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [typedValue, setTypedValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const confirmationBlocked = Boolean(
    (requireText && typedValue.trim() !== requireText)
    || (requireReauth && password.trim().length < 8),
  );

  const resetDialog = () => {
    setOpen(false);
    setTypedValue('');
    setPassword('');
    setError(null);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={async () => {
          const allowed = beforeOpen ? await beforeOpen() : true;
          if (!allowed) {
            return;
          }
          setError(null);
          setOpen(true);
        }}
      >
        {children}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (submitting) {
            return;
          }
          resetDialog();
        }}
        title={title}
        description={description ?? confirmText}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <p>{confirmText}</p>
          </div>
          {requireText ? (
            <Field
              label={`Type ${requireText} to continue`}
              hint="This helps prevent accidental destructive changes."
            >
              <Input value={typedValue} onChange={(event) => setTypedValue(event.target.value)} />
            </Field>
          ) : null}
          {requireReauth ? (
            <Field
              label={reauthLabel}
              hint="Enter your current account password before the change is sent to the backend."
              error={error ?? undefined}
            >
              <Input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
              />
            </Field>
          ) : null}
          {error && !requireReauth ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                resetDialog();
              }}
              disabled={submitting}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={variant === 'danger' ? 'danger' : 'primary'}
              loading={submitting}
              disabled={confirmationBlocked}
              onClick={async () => {
                setSubmitting(true);
                try {
                  const reauth = requireReauth
                    ? await reauthRequest({ password })
                    : null;
                  await onConfirm({ reauthToken: reauth?.reauthToken });
                  resetDialog();
                } catch (caughtError) {
                  setError(caughtError instanceof Error ? caughtError.message : 'Unable to verify this action');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
