import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotFound } from '@/components/NotFound';
import { cn } from '@/components/cn';
import { useAuth } from '@/features/auth/useAuth';
import { AuditTab } from './AuditTab';
import { ReportsTab } from './ReportsTab';

type Tab = 'reports' | 'audit';

/** Admin tools. Anyone else (and anonymous visitors) gets the same page as an unknown address. */
export default function AdminPage() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('reports');

  if (isLoading) return <p className="py-16 text-sub">{t('common:loading')}</p>;
  if (!user || user.role !== 'admin') return <NotFound />;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'reports', label: t('admin:tabs.reports') },
    { id: 'audit', label: t('admin:tabs.audit') },
  ];

  return (
    <div className="pb-16">
      <h1 className="pt-10 text-[1.6rem] font-semibold text-text">{t('admin:heading')}</h1>

      <div role="tablist" aria-label={t('admin:tabs.label')} className="mt-6 flex gap-1 rounded-[10px] bg-surface/60 p-1 w-fit">
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`admin-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`admin-panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-[6px] px-3 py-1 text-[0.95rem] transition-colors',
              tab === item.id ? 'text-main' : 'text-sub hover:text-text',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`} className="mt-8">
        {tab === 'reports' ? <ReportsTab /> : <AuditTab />}
      </div>
    </div>
  );
}
