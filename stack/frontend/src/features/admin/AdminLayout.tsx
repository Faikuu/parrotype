import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { NotFound } from '@/components/NotFound';
import { useAuth } from '@/features/auth/useAuth';
import { AdminNav } from './components/AdminNav';
import { ToastProvider } from './components/Toast';
import { usePermissions } from './usePermissions';

/**
 * The admin shell, for every /admin/* route. Anonymous visitors and users with no permissions get the
 * same NotFound page as an unknown address, so the panel's existence is not revealed.
 */
export default function AdminLayout() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const { hasAny } = usePermissions();

  if (isLoading) return <p className="py-16 text-sub">{t('common:loading')}</p>;
  if (!user || !hasAny) return <NotFound />;

  return (
    <ToastProvider>
      <div className="flex flex-col gap-6 pb-16 pt-8 md:flex-row md:gap-10">
        <AdminNav />
        <div className="min-w-0 flex-1">
          <Suspense fallback={<p className="text-sub">{t('common:loading')}</p>}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </ToastProvider>
  );
}
