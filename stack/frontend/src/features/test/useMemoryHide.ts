import { useEffect, useState } from 'react';
import { MEMORY_SHOW_MS } from './funbox';

/**
 * For the memory funbox: true once the words have been shown for MEMORY_SHOW_MS since the start, so the upcoming
 * words should be hidden. Always false when the funbox is off or the test has not started.
 */
export function useMemoryHide(enabled: boolean, startedAt: number | null): boolean {
  // The start time the timer was set for: the hidden state belongs to it, so a restart shows the words again.
  const [hiddenFor, setHiddenFor] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || startedAt === null) return;
    const remaining = startedAt + MEMORY_SHOW_MS - Date.now();
    if (remaining <= 0) {
      setHiddenFor(startedAt);
      return;
    }
    const id = setTimeout(() => setHiddenFor(startedAt), remaining);
    return () => clearTimeout(id);
  }, [enabled, startedAt]);

  return enabled && startedAt !== null && hiddenFor === startedAt;
}
