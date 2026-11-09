import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ToastContext } from './useToast';

const SHOW_MS = 3000;

/**
 * Hosts the admin toast. The live region is always in the DOM, so screen readers announce every
 * message that is written into it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ id: number; text: string } | null>(null);

  const show = useCallback((text: string) => setMessage({ id: Date.now(), text }), []);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [message]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4"
      >
        {message && (
          <p key={message.id} className="rounded-[10px] bg-surface px-4 py-2.5 text-[0.95rem] text-text">
            {message.text}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}
