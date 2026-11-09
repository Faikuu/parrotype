import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/components/cn';
import { announcementsApi } from '@/lib/api';
import { readDismissed, writeDismissed } from './dismissed';

/** At most this many banners at once (the server sends no more). */
export const BANNER_MAX = 3;

/**
 * The active announcements, under the header. Info uses the surface colour; a warning gets a --caret left border.
 * Each one is dismissed per id, and the dismissal is kept in localStorage.
 */
export function AnnouncementBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<number[]>(() => readDismissed());
  const query = useQuery({
    queryKey: ['announcements', 'active'],
    queryFn: ({ signal }) => announcementsApi.active(signal),
    staleTime: 60_000,
  });

  const items = (query.data ?? []).filter((a) => !dismissed.includes(a.id)).slice(0, BANNER_MAX);
  if (items.length === 0) return null;

  function dismiss(id: number) {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <div className="flex flex-col gap-2 pb-4">
      {items.map((a) => {
        const warning = a.level === 'warning';
        return (
          <div
            key={a.id}
            role="status"
            className={cn(
              'flex items-start gap-3 rounded-[10px] bg-surface px-4 py-3 text-[0.95rem] text-text',
              warning && 'border-l-[3px] border-caret',
            )}
          >
            <p className="min-w-0 flex-1 break-words">
              {warning && <span className="sr-only">{t('announcements:warning')}: </span>}
              {a.message}
            </p>
            <button
              type="button"
              aria-label={t('announcements:dismiss')}
              onClick={() => dismiss(a.id)}
              className="shrink-0 rounded-full p-1 text-sub transition-colors hover:text-text"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
