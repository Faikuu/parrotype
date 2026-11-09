import { useTranslation } from 'react-i18next';
import type { Achievement, AchievementId } from '@/lib/api/types';
import { formatUtcDay } from './calendar';
import { ACHIEVEMENT_ICONS, ACHIEVEMENT_IDS } from './achievementCatalog';

/**
 * Achievements as plain text blocks: unlocked ones in --text with their date, locked ones
 * faded to 50% in --sub. The profile shows only the unlocked ones (onlyUnlocked).
 */
export function AchievementsGrid({
  achievements,
  onlyUnlocked = false,
}: {
  achievements: readonly Achievement[];
  onlyUnlocked?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const unlocked = new Map<AchievementId, string>(achievements.map((a) => [a.id, a.unlockedAt]));
  const ids = ACHIEVEMENT_IDS.filter((id) => !onlyUnlocked || unlocked.has(id));

  if (ids.length === 0) {
    return <p className="text-sub">{t('achievements.empty')}</p>;
  }

  return (
    <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {ids.map((id) => {
        const unlockedAt = unlocked.get(id);
        const isUnlocked = unlockedAt !== undefined;
        const Icon = ACHIEVEMENT_ICONS[id];
        return (
          <li
            key={id}
            data-unlocked={isUnlocked}
            className={`flex gap-3 ${isUnlocked ? '' : 'opacity-50'}`}
          >
            <Icon
              aria-hidden="true"
              size={22}
              strokeWidth={1.75}
              className={`mt-0.5 shrink-0 ${isUnlocked ? 'text-caret' : 'text-sub'}`}
            />
            <div className="min-w-0">
              <p className={`font-medium ${isUnlocked ? 'text-text' : 'text-sub'}`}>
                {t(`achievements.items.${id}.name`)}
              </p>
              <p className="text-[0.9rem] text-sub">{t(`achievements.items.${id}.description`)}</p>
              {isUnlocked ? (
                <p className="text-[0.85rem] text-sub">
                  <time dateTime={unlockedAt}>
                    {t('achievements.unlockedOn', { date: formatUtcDay(unlockedAt, lang) })}
                  </time>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
