import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';

/** How often the unread count is refreshed while the tab is visible. */
export const UNREAD_POLL_MS = 60_000;

export const UNREAD_KEY = ['notifications', 'unread-count'] as const;

/**
 * The unread count. It is polled every minute, but only while the document is visible, and refreshed when the
 * window regains focus. Hidden tabs cost nothing, and a tab that comes back shows the current count at once.
 */
export function useUnreadCount(enabled: boolean): number {
  const query = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async ({ signal }) => (await notificationsApi.unreadCount(signal)).count,
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  const refetch = query.refetch;

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    const id = window.setInterval(refresh, UNREAD_POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, refetch]);

  return query.data ?? 0;
}

/** Marks every notification read (or the given ids), then refreshes the count and the lists. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => notificationsApi.markRead(ids),
    onSuccess: (_result, ids) => {
      // Mark-all clears the badge at once; the refetch below confirms it.
      if (!ids) qc.setQueryData(UNREAD_KEY, 0);
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
