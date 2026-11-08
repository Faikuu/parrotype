import { useTranslation } from 'react-i18next';

export default function LeaderboardPage() {
  const { t } = useTranslation();
  return <p className="py-16 text-sub">{t('common:placeholder')}</p>;
}
