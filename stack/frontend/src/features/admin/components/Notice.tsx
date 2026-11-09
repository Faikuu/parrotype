import type { ReactNode } from 'react';
import { cn } from '@/components/cn';

/** An inline message. Errors use role=alert so they are read out straight away. */
export function Notice({ tone = 'error', children, className }: { tone?: 'error' | 'info'; children: ReactNode; className?: string }) {
  return (
    <p role={tone === 'error' ? 'alert' : undefined} className={cn(tone === 'error' ? 'text-error' : 'text-sub', 'text-[0.95rem]', className)}>
      {children}
    </p>
  );
}
