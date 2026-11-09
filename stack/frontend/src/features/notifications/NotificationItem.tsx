import { useTranslation } from 'react-i18next';
import { relativeTime } from '@/features/account/format';
import type { AppNotification } from '@/lib/api/types';
import { NotificationText } from './NotificationText';

/** One row of the bell panel or the notifications page. Unread rows get a --main dot. */
export function NotificationItem({ item }: { item: AppNotification }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const unread = item.readAt === null;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={unread ? 'mt-[0.45rem] size-2 shrink-0 rounded-full bg-main' : 'mt-[0.45rem] size-2 shrink-0'}
      />
      <div className="min-w-0 flex-1">
        <p className="break-words text-[0.95rem] text-text">
          {unread && <span className="sr-only">{t('notifications:bell.unread')}: </span>}
          <NotificationText item={item} />
        </p>
        <time dateTime={item.createdAt} className="text-[0.85rem] text-sub">
          {relativeTime(item.createdAt, lang)}
        </time>
      </div>
    </li>
  );
}
