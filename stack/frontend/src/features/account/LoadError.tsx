import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';

/** An inline error with a retry button. The message defaults to the generic account one. */
export function LoadError({ onRetry, message }: { onRetry: () => void; message?: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4">
      <p className="text-error">{message ?? t('account:loadError')}</p>
      <Button variant="ghost" onClick={onRetry}>
        {t('common:retry')}
      </Button>
    </div>
  );
}
