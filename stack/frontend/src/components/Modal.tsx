import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return <ModalDialog onClose={onClose} title={title}>{children}</ModalDialog>;
}

function ModalDialog({ onClose, title, children }: Omit<ModalProps, 'open'>) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read during render, before the opener unmounts and before this effect moves focus into the dialog.
  // (Reading it inside the effect can see the opener already gone, e.g. the palette closing as this opens.)
  const [returnFocusTo] = useState<HTMLElement | null>(() => {
    const el = document.activeElement;
    return el instanceof HTMLElement && el !== document.body ? el : null;
  });

  useEffect(() => {
    const target =
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      focusables(dialogRef.current)[0] ??
      dialogRef.current;
    target?.focus();
    return () => {
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    };
  }, [returnFocusTo]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(dialogRef.current);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg/60 px-4 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-[520px] rounded-[10px] bg-surface p-5 text-text outline-none"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-[1.1rem] font-semibold">
            {title}
          </h2>
          <Button variant="ghost" aria-label={t('common:close')} title={t('common:close')} onClick={onClose} className="rounded-full p-2">
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
