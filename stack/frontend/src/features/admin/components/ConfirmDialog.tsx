import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { Modal } from '@/components/Modal';
import { Notice } from './Notice';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  /** When set, the confirm button stays disabled until this exact text is typed. */
  requireText?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, title, onCancel } = props;
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <ConfirmBody {...props} />
    </Modal>
  );
}

function ConfirmBody({
  body,
  confirmLabel,
  danger = false,
  requireText,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [typed, setTyped] = useState('');
  const matches = requireText === undefined || typed === requireText;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!matches || pending) return;
    onConfirm();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {body && <div className="text-[0.95rem] text-sub">{body}</div>}
      {requireText !== undefined && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="text-[0.9rem] text-sub">
            {t('admin:confirm.typeToConfirm', { text: requireText })}
          </label>
          <input
            id={fieldId}
            data-autofocus
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none"
          />
        </div>
      )}
      {error && <Notice>{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          {t('common:cancel')}
        </Button>
        <Button
          type="submit"
          disabled={!matches || pending}
          className={cn(danger && 'bg-error text-bg hover:opacity-90')}
        >
          {pending ? t('admin:actions.working') : confirmLabel}
        </Button>
      </div>
    </form>
  );
}
