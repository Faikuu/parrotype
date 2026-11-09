import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { cn } from '@/components/cn';
import { OnScreenKeyboard } from '@/components/OnScreenKeyboard';
import { useAuth } from '@/features/auth/useAuth';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { ConfigBar } from './ConfigBar';
import { HighContrastSuggestion } from './HighContrastSuggestion';
import { LiveStats } from './LiveStats';
import { nextCharOf } from './nextChar';
import { Results } from './Results';
import { TestAnnouncer } from './TestAnnouncer';
import { useMemoryHide } from './useMemoryHide';
import { Words } from './Words';
import './test.css';
import { useTypingTest } from './useTypingTest';

export default function TestPage() {
  const { t } = useTranslation();
  const test = useTypingTest();
  const { user } = useAuth();
  const [focused, setFocused] = useState(false);
  const focusMode = useSettings((s) => s.focusMode);
  const funbox = useSettings((s) => s.funbox);
  const showKeyboard = useSettings((s) => s.showKeyboard);
  const keyboardHints = useSettings((s) => s.keyboardHints);
  const layout = useSettings((s) => s.layout);
  const tapeMode = useSettings((s) => s.tapeMode);
  const typing = useUi((s) => s.isTyping);
  // The palette and custom text dialog take focus, so the page reads as unfocused; the hint would cover the words.
  const overlayOpen = useUi((s) => s.commandLineOpen || s.customTextOpen);
  const { focusInput } = test;
  const memoryHidden = useMemoryHide(funbox.includes('memory'), test.state.startedAt);

  // Start typing right away unless the user is already in another field.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) focusInput();
  }, [focusInput]);

  const finished = test.state.status === 'finished';
  const result = test.result;
  const quoteMode = test.state.config.mode === 'quote';
  const mode = test.state.config.mode;
  // The keyboard is drawn under the test when asked for, except in tape and code modes, where the lines move.
  const keyboardShown = showKeyboard && !tapeMode && mode !== 'code' && !finished;
  const next = useMemo(() => nextCharOf(test.state), [test.state]);
  const announce = {
    started: test.state.startedAt !== null,
    finished: result ? { wpm: result.wpm, accuracy: result.accuracy, failedWord: result.failed ? test.state.current + 1 : null } : null,
    save: test.saveState,
  };

  return (
    <div className="flex flex-1 flex-col pb-8">
      <TestAnnouncer input={announce} />
      <HighContrastSuggestion />

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
            state={test.state}
            date={test.runDate}
            saveState={test.saveState}
            onNext={test.restart}
            onRepeat={test.repeat}
            onRaceGhost={test.raceGhost}
            username={user?.name ?? null}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {test.quote.loading && <p className="text-sub">{t('test:quoteLoading')}</p>}

            {/* Tapping the words must not move focus away from the hidden input: that would hide the
                keyboard, and the overlay would then appear under the finger and swallow the click. */}
            <div className="relative" onMouseDown={(e) => e.preventDefault()}>
              <Words
                state={test.state}
                onActivate={focusInput}
                pace={test.pace}
                ghost={test.ghost}
                mirror={funbox.includes('mirror')}
                hideUpcoming={memoryHidden}
              />
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
            {test.snippetTitle && (
              <p className="text-center text-[0.9rem] text-sub">{t('test:codeSource', { title: test.snippetTitle })}</p>
            )}
            {quoteMode && test.quote.fallback && (
              <p className="text-center text-[0.9rem] text-sub">{t('test:quoteFallback')}</p>
            )}

            {keyboardShown && (
              <div className={cn('mx-auto w-full max-w-[860px]', typing && focusMode && 'opacity-40')}>
                <OnScreenKeyboard layout={layout} next={next} hints={keyboardHints} />
              </div>
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
