import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AtSign, Ban, Globe, Hash, Skull } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/components/cn';
import { LANGUAGE_NAMES, LANGUAGES } from '@/lib/text/languages';
import { utcDateString } from '@/lib/text/daily';
import type { CodeLanguage, Mode, PangramCount, QuoteLength, TimeOption, WordsOption } from '@/lib/engine/types';
import { useKeyStats, weakLetters } from '@/store/keyStats';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';

const MODES: readonly Mode[] = ['time', 'words', 'quote', 'zen', 'pangram', 'custom', 'daily', 'weak', 'code'];
/** Snippet languages for code mode. Language names are shown as they are written, so they are not translated. */
const CODE_LANGUAGES: readonly { id: CodeLanguage; name: string }[] = [
  { id: 'js', name: 'JavaScript' },
  { id: 'py', name: 'Python' },
  { id: 'rs', name: 'Rust' },
  { id: 'go', name: 'Go' },
];
const TIMES: readonly TimeOption[] = [15, 30, 60, 120];
const WORD_COUNTS: readonly WordsOption[] = [10, 25, 50, 100];
const QUOTE_LENGTHS: readonly QuoteLength[] = ['short', 'medium', 'long', 'any'];
const PANGRAMS: readonly PangramCount[] = [1, 3, 5];

interface OptProps {
  pressed?: boolean;
  onPick: () => void;
  children: ReactNode;
  keepFocus?: boolean;
  title?: string;
  ariaLabel?: string;
}

/** A config option. Clicking hands focus back to the test input so typing continues. */
function Opt({ pressed, onPick, children, keepFocus, title, ariaLabel }: OptProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => {
        onPick();
        e.currentTarget.blur();
        if (!keepFocus) document.querySelector<HTMLInputElement>('[data-typing-input]')?.focus({ preventScroll: true });
      }}
      className={cn(
        'rounded-[6px] px-2 py-1 transition-colors',
        pressed ? 'text-main' : 'text-sub hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-2 h-4 w-px bg-bg" />;
}

/** "Nov 8" for a UTC date, in the UI language. */
function shortDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function ConfigBar() {
  const { t, i18n } = useTranslation();
  const cfg = useSettings(
    useShallow((s) => ({
      mode: s.mode,
      time: s.time,
      words: s.words,
      quoteLength: s.quoteLength,
      pangramCount: s.pangramCount,
      punctuation: s.punctuation,
      numbers: s.numbers,
      language: s.language,
      focusMode: s.focusMode,
      noBackspace: s.noBackspace,
      suddenDeath: s.suddenDeath,
      codeLanguage: s.codeLanguage,
    })),
  );
  const set = useSettings((s) => s.set);
  const funbox = useSettings((s) => s.funbox);
  const typing = useUi((s) => s.isTyping);
  const openCustomText = useUi((s) => s.openCustomText);
  const langStats = useKeyStats((s) => s.byLanguage[cfg.language]);

  const showToggles = cfg.mode === 'time' || cfg.mode === 'words';

  let sub: ReactNode = null;
  switch (cfg.mode) {
    case 'time':
      sub = TIMES.map((v) => (
        <Opt key={v} pressed={cfg.time === v} onPick={() => set('time', v)}>
          {v}
        </Opt>
      ));
      break;
    case 'words':
      sub = WORD_COUNTS.map((v) => (
        <Opt key={v} pressed={cfg.words === v} onPick={() => set('words', v)}>
          {v}
        </Opt>
      ));
      break;
    case 'quote':
      sub = QUOTE_LENGTHS.map((v) => (
        <Opt key={v} pressed={cfg.quoteLength === v} onPick={() => set('quoteLength', v)}>
          {t(`settings:quoteLengths.${v}`)}
        </Opt>
      ));
      break;
    case 'pangram':
      sub = PANGRAMS.map((v) => (
        <Opt key={v} pressed={cfg.pangramCount === v} onPick={() => set('pangramCount', v)}>
          {v}
        </Opt>
      ));
      break;
    case 'custom':
      sub = <Opt onPick={openCustomText} keepFocus>{t('test:edit')}</Opt>;
      break;
    case 'zen':
      sub = null;
      break;
    case 'daily':
      sub = (
        <time dateTime={utcDateString()} className="px-2 py-1 text-text">
          {shortDate(utcDateString(), i18n.language)}
        </time>
      );
      break;
    case 'code':
      sub = CODE_LANGUAGES.map((l) => (
        <Opt key={l.id} pressed={cfg.codeLanguage === l.id} onPick={() => set('codeLanguage', l.id)}>
          {l.name}
        </Opt>
      ));
      break;
    case 'weak': {
      const letters = weakLetters(langStats, cfg.language);
      sub =
        letters.length > 0 ? (
          <span className="px-2 py-1 tracking-[0.2em] text-text" title={t('test:weakLetters', { letters: letters.join(' ') })}>
            {letters.join(' ')}
          </span>
        ) : (
          <span className="px-2 py-1 text-sub">{t('test:typeFewTests')}</span>
        );
      break;
    }
  }

  const nextLanguage = LANGUAGES[(LANGUAGES.indexOf(cfg.language) + 1) % LANGUAGES.length] ?? 'en';

  return (
    <div
      role="group"
      aria-label={t('test:configGroup')}
      className={cn(
        'flex max-w-full flex-wrap items-center justify-center gap-y-1 rounded-[10px] bg-surface/60 px-3 py-1.5 text-[0.85rem] transition-opacity duration-150',
        typing && (cfg.focusMode ? 'pointer-events-none opacity-0' : 'pointer-events-none opacity-[0.35]'),
      )}
    >
      {showToggles && (
        <>
          <div className="flex items-center gap-0.5">
            <Opt pressed={cfg.punctuation} onPick={() => set('punctuation', !cfg.punctuation)}>
              <AtSign size={13} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
              {t('test:punctuation')}
            </Opt>
            <Opt pressed={cfg.numbers} onPick={() => set('numbers', !cfg.numbers)}>
              <Hash size={13} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
              {t('test:numbers')}
            </Opt>
          </div>
          <Divider />
        </>
      )}

      <div className="flex flex-wrap items-center gap-0.5">
        {MODES.map((m) => (
          <Opt key={m} pressed={cfg.mode === m} onPick={() => set('mode', m)}>
            {t(`settings:modes.${m}`)}
          </Opt>
        ))}
      </div>

      {sub !== null && (
        <>
          <Divider />
          <div className="flex flex-wrap items-center gap-0.5">{sub}</div>
        </>
      )}

      {cfg.mode !== 'zen' && (
        <>
          <Divider />
          <div role="group" aria-label={t('test:modifiers')} className="flex items-center gap-0.5">
            <Opt
              pressed={cfg.noBackspace}
              onPick={() => set('noBackspace', !cfg.noBackspace)}
              title={t('test:noBackspaceTitle')}
            >
              <Ban size={13} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
              {t('test:noBackspace')}
            </Opt>
            <Opt
              pressed={cfg.suddenDeath}
              onPick={() => set('suddenDeath', !cfg.suddenDeath)}
              title={t('test:suddenDeathTitle')}
            >
              <Skull size={13} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
              {t('test:suddenDeath')}
            </Opt>
          </div>
        </>
      )}

      {funbox.length > 0 && (
        <>
          <Divider />
          <span className="px-2 py-1 text-main" title={funbox.map((id) => t(`funbox:${id}`)).join(', ')}>
            {t('funbox:label')}: {funbox.map((id) => t(`funbox:${id}`)).join(', ')}
          </span>
        </>
      )}

      {cfg.mode !== 'custom' && cfg.mode !== 'zen' && cfg.mode !== 'code' && (
        <>
          <Divider />
          <Opt
            onPick={() => set('language', nextLanguage)}
            title={t('test:changeLanguage')}
            ariaLabel={`${t('settings:language')}: ${LANGUAGE_NAMES[cfg.language]}. ${t('test:changeLanguage')}`}
          >
            <Globe size={13} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
            {LANGUAGE_NAMES[cfg.language]}
          </Opt>
        </>
      )}
    </div>
  );
}
