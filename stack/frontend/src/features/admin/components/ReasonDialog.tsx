import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { Notice } from './Notice';

export const REASON_MAX = 200;

/** A dialog that asks for a required reason of up to 200 characters, then calls onSubmit. */
export function ReasonDialog({
  open,
  title,
  hint,
  submitLabel,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  hint: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <ReasonForm hint={hint} submitLabel={submitLabel} pending={pending} error={error} onCancel={onCancel} onSubmit={onSubmit} />
    </Modal>
  );
}

function ReasonForm({
  hint,
  submitLabel,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  hint: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed.length === 0 || pending) return;
    onSubmit(trimmed);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-[0.9rem] text-sub">
          {t('admin:reason.label')}
        </label>
        <textarea
          id={fieldId}
          data-autofocus
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby={`${fieldId}-hint`}
          className="rounded-[6px] bg-bg px-3 py-2.5 text-text outline-none"
        />
        <p id={`${fieldId}-hint`} className="text-[0.85rem] text-sub">
          {hint}
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          {t('common:cancel')}
        </Button>
        <Button type="submit" disabled={trimmed.length === 0 || pending}>
          {pending ? t('admin:actions.working') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
