import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AtSign, Hash } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/components/cn';
import type { Mode, PangramCount, QuoteLength, TimeOption, WordsOption } from '@/lib/engine/types';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';

const MODES: readonly Mode[] = ['time', 'words', 'quote', 'zen', 'pangram', 'custom'];
const TIMES: readonly TimeOption[] = [15, 30, 60, 120];
const WORD_COUNTS: readonly WordsOption[] = [10, 25, 50, 100];
const QUOTE_LENGTHS: readonly QuoteLength[] = ['short', 'medium', 'long', 'any'];
const PANGRAMS: readonly PangramCount[] = [1, 3, 5];

interface OptProps {
  pressed?: boolean;
  onPick: () => void;
  children: ReactNode;
}

/** A config option. Clicking blurs it so typing goes straight back to the test. */
function Opt({ pressed, onPick, children }: OptProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={(e) => {
        onPick();
        e.currentTarget.blur();
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

export function ConfigBar() {
  const { t } = useTranslation();
  const cfg = useSettings(
    useShallow((s) => ({
      mode: s.mode,
      time: s.time,
      words: s.words,
      quoteLength: s.quoteLength,
      pangramCount: s.pangramCount,
      punctuation: s.punctuation,
      numbers: s.numbers,
      focusMode: s.focusMode,
    })),
  );
  const set = useSettings((s) => s.set);
  const typing = useUi((s) => s.isTyping);
  const openCustomText = useUi((s) => s.openCustomText);

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
      sub = <Opt onPick={openCustomText}>{t('test:edit')}</Opt>;
      break;
    case 'zen':
      sub = null;
      break;
  }

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
    </div>
  );
}
