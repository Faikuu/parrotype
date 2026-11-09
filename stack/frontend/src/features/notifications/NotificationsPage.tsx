import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { useAuth } from '@/features/auth/useAuth';
import { notificationsApi } from '@/lib/api';
import { NotificationItem } from './NotificationItem';
import { useMarkRead } from './useNotifications';

const PAGE_SIZE = 20;

/** The full, paginated notification list. Page and the unread filter live in the URL. */
export default function NotificationsPage() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const unreadOnly = params.get('unread') === '1';
  const markRead = useMarkRead();

  const query = useQuery({
    queryKey: ['notifications', 'list', page, unreadOnly],
    queryFn: ({ signal }) => notificationsApi.list({ page, pageSize: PAGE_SIZE, unread: unreadOnly }, signal),
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <p className="py-16 text-sub">{t('common:loading')}</p>;

  if (!user) {
    return (
      <div className="flex flex-col gap-4 pb-16 pt-10">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('notifications:page.title')}</h1>
        <p className="text-sub">{t('notifications:page.loginPrompt')}</p>
        <div>
          <Link to="/login?next=%2Fnotifications" className="text-main">
            {t('notifications:page.login')}
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

  function go(next: Record<string, string | null>) {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) {
        if (v === null) out.delete(k);
        else out.set(k, v);
      }
      return out;
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-16 pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('notifications:page.title')}</h1>
        <Button disabled={markRead.isPending} onClick={() => markRead.mutate(undefined)}>
          {t('notifications:page.markAll')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[0.95rem] text-sub">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => go({ unread: e.target.checked ? '1' : null, page: null })}
            className="size-4 accent-[var(--main)]"
          />
          {t('notifications:page.unreadOnly')}
        </label>
      </div>

      {query.isError ? (
        <p role="alert" className="text-error">
          {t('notifications:page.loadError')}
        </p>
      ) : query.isPending ? (
        <p className="text-sub">{t('common:loading')}</p>
      ) : query.data.items.length === 0 ? (
        <p className="text-sub">{unreadOnly ? t('notifications:page.emptyUnread') : t('notifications:page.empty')}</p>
      ) : (
        <ul className="divide-y divide-surface">
          {query.data.items.map((item) => (
            <NotificationItem key={item.id} item={item} />
          ))}
        </ul>
      )}

      {query.data && query.data.total > PAGE_SIZE && (
        <nav aria-label={t('notifications:page.title')} className="flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={page <= 1} onClick={() => go({ page: page - 1 <= 1 ? null : String(page - 1) })}>
            {t('notifications:page.prev')}
          </Button>
          <span className="tabular text-[0.9rem] text-sub">
            {t('notifications:page.pageOf', { page, pages: totalPages })}
          </span>
          <Button variant="ghost" disabled={page >= totalPages} onClick={() => go({ page: String(page + 1) })}>
            {t('notifications:page.next')}
          </Button>
        </nav>
      )}
    </div>
  );
}
