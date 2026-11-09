import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/useAuth';
import { notificationsApi } from '@/lib/api';
import { useMarkRead, useUnreadCount } from './useNotifications';
import { NotificationItem } from './NotificationItem';

const PANEL_SIZE = 10;

/** The count shown on the badge: the number up to 9, then "9+". */
function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}

/** The header's bell: an unread badge and a dropdown with the latest notifications. Signed-in users only. */
export function NotificationBell() {
  const { user } = useAuth();
  if (!user) return null;
  return <BellWithPanel />;
}

function BellWithPanel() {
  const { t } = useTranslation();
  const count = useUnreadCount(true);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const latest = useQuery({
    queryKey: ['notifications', 'latest', PANEL_SIZE],
    queryFn: ({ signal }) => notificationsApi.list({ page: 1, pageSize: PANEL_SIZE }, signal),
    enabled: open,
    retry: false,
  });
  const markRead = useMarkRead();

  // Focus moves into the panel when it opens. Esc or a click outside closes it.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // A route change closes the panel (the header stays mounted across pages).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close(true);
    }
  }

  const label = count > 0 ? t('notifications:bell.labelCount', { n: count }) : t('notifications:bell.label');

  return (
    <div ref={containerRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        title={t('notifications:bell.label')}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-1 text-sub transition-colors hover:text-text sm:p-2"
      >
        <Bell size={20} aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="tabular absolute -right-0.5 -top-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-caret px-1 text-[0.7rem] font-semibold leading-[1.1rem] text-bg"
          >
            {badgeText(count)}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          role="region"
          aria-label={t('notifications:bell.panel')}
          tabIndex={-1}
          className="absolute right-0 z-40 mt-2 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[10px] bg-surface outline-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-bg px-4 py-2.5">
            <h2 className="text-[0.95rem] font-semibold text-text">{t('notifications:bell.panel')}</h2>
            <Button
              variant="ghost"
              className="px-2 py-1 text-[0.85rem]"
              disabled={markRead.isPending || count === 0}
              onClick={() => markRead.mutate(undefined)}
            >
              {t('notifications:bell.markAll')}
            </Button>
          </div>
          <div className="overflow-y-auto px-4">
            {latest.isError ? (
              <p role="alert" className="py-3 text-error">
                {t('notifications:bell.loadError')}
              </p>
            ) : latest.isPending ? (
              <p className="py-3 text-sub">{t('common:loading')}</p>
            ) : latest.data.items.length === 0 ? (
              <p className="py-3 text-sub">{t('notifications:bell.empty')}</p>
            ) : (
              <ul className="divide-y divide-bg">
                {latest.data.items.map((item) => (
                  <NotificationItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-bg px-4 py-2.5">
            <Link to="/notifications" onClick={() => setOpen(false)} className="text-[0.95rem] text-main">
              {t('notifications:bell.seeAll')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
