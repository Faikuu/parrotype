import type { ReactNode } from 'react';

/**
 * Explains a disabled control. The tooltip sits on this wrapper, because disabled buttons don't get
 * pointer events in every browser. The reason is also set as the accessible description of the child
 * by the caller where that matters.
 */
export function Tip({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <span title={reason} className="inline-flex">
      {children}
    </span>
  );
}
