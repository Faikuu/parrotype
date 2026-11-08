import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { cn } from '@/components/cn';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { ConfigBar } from './ConfigBar';
import { LiveStats } from './LiveStats';
import { Results } from './Results';
import { Words } from './Words';
import './test.css';
import { useTypingTest } from './useTypingTest';

export default function TestPage() {
  const { t } = useTranslation();
  const test = useTypingTest();
  const [focused, setFocused] = useState(false);
  const focusMode = useSettings((s) => s.focusMode);
  const typing = useUi((s) => s.isTyping);
  // The palette and custom text dialog take focus, so the page reads as unfocused; the hint would cover the words.
  const overlayOpen = useUi((s) => s.commandLineOpen || s.customTextOpen);
  const { focusInput } = test;

  // Start typing right away unless the user is already in another field.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) focusInput();
  }, [focusInput]);

  const finished = test.state.status === 'finished';
  const result = test.result;
  const quoteMode = test.state.config.mode === 'quote';

  return (
    <div className="flex flex-1 flex-col pb-8">
      <div className="mt-12 flex justify-center">
        <ConfigBar />
      </div>

      <div className="flex min-h-[60vh] flex-1 flex-col justify-center gap-4 py-10">
        <LiveStats state={test.state} />

        <input
          ref={test.inputRef}
          data-typing-input
          type="text"
          className="sr-only"
          aria-label={t('test:inputLabel')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onKeyDown={test.onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />

        {finished && result ? (
          <Results
            config={test.state.config}
            result={result}
            saveState={test.saveState}
            onNext={test.restart}
            onRepeat={test.repeat}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {test.quote.loading && <p className="text-sub">{t('test:quoteLoading')}</p>}

            <div className="relative">
              <Words state={test.state} onActivate={focusInput} />
              {!focused && !finished && !overlayOpen && (
                <button
                  type="button"
                  onClick={focusInput}
                  className="absolute inset-0 z-10 flex cursor-text items-center justify-center bg-bg/40 text-sub backdrop-blur-[3px]"
                >
                  {t('test:focusHint')}
                </button>
              )}
            </div>

            {quoteMode && test.quote.source && (
              <p className="text-center text-[0.9rem] text-sub">
                {t('test:quoteSource', { source: test.quote.source })}
              </p>
            )}
            {quoteMode && test.quote.fallback && (
              <p className="text-center text-[0.9rem] text-sub">{t('test:quoteFallback')}</p>
            )}

            <div className="flex justify-center">
              <button
                type="button"
                data-typing-redirect=""
                onClick={test.restart}
                aria-label={t('test:restart')}
                title={t('test:restartTitle')}
                className={cn(
                  'grid size-11 place-items-center rounded-full text-sub transition-[opacity,color] duration-150 hover:text-text',
                  typing && focusMode && 'pointer-events-none opacity-0',
                )}
              >
                <RotateCw size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
