import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-3 py-16">
      <h1 className="text-[1.6rem] font-semibold">{t('common:notFound')}</h1>
      <p className="text-sub">{t('common:notFoundBody')}</p>
      <Link to="/" className="text-main underline-offset-4 hover:underline">
        {t('common:backToTest')}
      </Link>
    </div>
  );
}
