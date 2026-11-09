import { useEffect, useState } from 'react';

/**
 * Whole seconds until `startsAt` (rounded up: 3, 2, 1, then 0), or null while inactive. Driven by
 * requestAnimationFrame, but only re-renders when the displayed number changes.
 */
export function useCountdown(startsAt: number | null, active: boolean): number | null {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    if (!active || startsAt === null) return;
    const schedule = (cb: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(cb)
        : (setTimeout(cb, 16) as unknown as number);
    const cancel = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };

    let frame = 0;
    let last: number | null = null;
    const tick = () => {
      const remaining = startsAt - Date.now();
      const seconds = Math.max(0, Math.ceil(remaining / 1000));
      if (seconds !== last) {
        last = seconds;
        setValue(seconds);
      }
      if (remaining > 0) frame = schedule(tick);
    };
    frame = schedule(tick);
    return () => cancel(frame);
  }, [startsAt, active]);

  return active ? value : null;
}
