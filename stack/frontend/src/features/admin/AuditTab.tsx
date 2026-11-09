import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { formatDateTime } from '@/features/account/format';
import { adminApi, type AdminAuditEntry } from '@/lib/api';

export function AuditTab() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const query = useQuery({
    queryKey: ['admin', 'actions'],
    queryFn: ({ signal }) => adminApi.actions(signal),
  });

  if (query.isPending) return <p className="text-sub">{t('common:loading')}</p>;
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-4">
        <p className="text-error">{t('admin:errors.load')}</p>
        <Button variant="ghost" onClick={() => void query.refetch()}>
          {t('admin:retry')}
        </Button>
      </div>
    );
  }
  if (query.data.length === 0) return <p className="text-text">{t('admin:empty.audit')}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="text-[0.9rem] text-sub">
            <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.when')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.admin')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.action')}</th>
            <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.target')}</th>
            <th scope="col" className="py-2 font-normal">{t('admin:cols.note')}</th>
          </tr>
        </thead>
        <tbody>
          {query.data.map((entry: AdminAuditEntry) => (
            <tr key={entry.id} className="border-t border-surface align-top">
              <td className="py-2 pr-4 whitespace-nowrap text-sub">
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, lang)}</time>
              </td>
              <td className="py-2 pr-4 text-text">{entry.adminName ?? t('admin:commandLine')}</td>
              <td className="py-2 pr-4 text-text">{actionLabel(entry.action, t)}</td>
              <td className="py-2 pr-4">
                <code className="text-sub">{entry.target}</code>
              </td>
              <td className="py-2 text-sub">{entry.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function actionLabel(action: string, t: (k: string) => string): string {
  const key = `admin:auditLabels.${action}`;
  const label = t(key);
  return label === key ? action : label;
}
