import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import type { Language } from '@/lib/engine/types';
import { LANGUAGE_NAMES, LANGUAGES } from '@/lib/text/languages';
import { useSettings } from '@/store/settings';
import { createRace } from './api';
import { cn } from '@/components/cn';

/** /race: pick a language, create a room, and go to it. */
export default function RaceLobbyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [language, setLanguage] = useState<Language>(() => useSettings.getState().language);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      const { id } = await createRace(language);
      navigate(`/race/${id}`);
    } catch {
      setError(t('race:lobby.createFailed'));
      setPending(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-sans text-[2rem] font-semibold">{t('race:lobby.heading')}</h1>
        <p className="text-sub">{t('race:lobby.intro')}</p>
      </header>

      <div role="group" aria-label={t('race:lobby.languageGroup')} className="flex flex-wrap gap-2">
        {LANGUAGES.map((lang) => {
          const active = lang === language;
          return (
            <button
              key={lang}
              type="button"
              aria-pressed={active}
              onClick={() => setLanguage(lang)}
              className={cn(
                'rounded-[6px] px-3 py-1.5 text-[0.95rem] transition-colors',
                active ? 'bg-surface text-main' : 'text-sub hover:text-text',
              )}
            >
              {LANGUAGE_NAMES[lang]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-start gap-3">
        <Button onClick={create} disabled={pending}>
          {pending ? t('race:lobby.creating') : t('race:lobby.create')}
        </Button>
        {error && (
          <p role="alert" className="text-[0.95rem] text-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
