import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Filter, sort and page state kept in the URL search params, so a view can be bookmarked and the back
 * button works. Values equal to their default are left out of the URL. Any change resets the page to 1
 * unless the patch sets `page` itself.
 */
export function useUrlState<K extends string>(defaults: Record<K, string>) {
  const [params, setParams] = useSearchParams();

  const values = {} as Record<K, string>;
  for (const key of Object.keys(defaults) as K[]) {
    values[key] = params.get(key) ?? defaults[key];
  }

  const update = useCallback(
    (patch: Partial<Record<K, string>>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const key of Object.keys(patch) as K[]) {
          const value = patch[key];
          if (value === undefined || value === '' || value === defaults[key]) next.delete(key);
          else next.set(key, value);
        }
        // Any change to the view (a filter, the sort or the order) starts again from the first page.
        if (!('page' in patch) && Object.keys(patch).length > 0) next.delete('page');
        return next;
      });
    },
    // `defaults` is a module-level constant in every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  );

  return { values, update };
}

/** The current page from a URL value, never below 1. */
export function pageNumber(value: string): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
