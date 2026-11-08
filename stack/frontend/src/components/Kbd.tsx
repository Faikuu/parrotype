import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[4px] bg-surface px-1.5 py-0.5 text-[0.75rem] text-sub [font-family:var(--font-test)]">
      {children}
    </kbd>
  );
}
