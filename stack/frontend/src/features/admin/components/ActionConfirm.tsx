import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { errorText } from '../errors';
import { ConfirmDialog } from './ConfirmDialog';
import { Tip } from './Tip';
import { useToast } from './useToast';

export interface ActionConfirmProps {
  /** The button text. */
  label: string;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Type-to-confirm text. */
  requireText?: string;
  /** Why the action is not available. Disables the button and shows this as the tooltip. */
  disabledReason?: string | null;
  /** Sends the request. Errors show in the dialog with the server's message. */
  run: () => Promise<unknown>;
  /** Called after success, once the dialog has closed. */
  onDone?: () => void;
  /** The toast text after success. */
  done: string;
  className?: string;
}

/** A button that opens a confirmation dialog, then runs one write. */
export function ActionConfirm({
  label,
  title,
  body,
  confirmLabel,
  danger = false,
  requireText,
  disabledReason = null,
  run,
  onDone,
  done,
  className,
}: ActionConfirmProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: run,
    onSuccess: () => {
      setOpen(false);
      toast(done);
      onDone?.();
    },
  });

  return (
    <>
      <Tip reason={disabledReason}>
        <Button
          variant="ghost"
          className={className}
          disabled={disabledReason !== null || mutation.isPending}
          aria-disabled={disabledReason !== null || undefined}
          onClick={() => {
            mutation.reset();
            setOpen(true);
          }}
        >
          {label}
        </Button>
      </Tip>
      <ConfirmDialog
        open={open}
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        danger={danger}
        requireText={requireText}
        pending={mutation.isPending}
        error={mutation.error ? errorText(mutation.error, t) : null}
        onConfirm={() => mutation.mutate(undefined)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
