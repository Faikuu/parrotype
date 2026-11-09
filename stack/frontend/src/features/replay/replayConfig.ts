import type { CodeLanguage, EngineEvent, EngineState, Language, Mode, PangramCount, QuoteLength, TestConfig, TimeOption, WordsOption } from '@/lib/engine/types';
import { engineReducer } from '@/lib/engine/engine';
import { replayStateAt } from '@/lib/engine/replay';
import type { ReplayDto } from '@/lib/api/types';

const LANGUAGES: readonly Language[] = ['en', 'pl', 'de', 'es'];

/**
 * The test config a saved result was typed with, from its mode and mode2 (the same mapping the server uses to
 * check a replay). The punctuation and numbers flags are not part of the replay, so they stay off.
 */
export function configFromResult(result: Pick<ReplayDto['result'], 'mode' | 'mode2' | 'language'>): TestConfig {
  const language: Language = (LANGUAGES as readonly string[]).includes(result.language) ? (result.language as Language) : 'en';
  const base: TestConfig = {
    mode: 'time',
    time: 60,
    words: 25,
    quoteLength: 'any',
    pangramCount: 1,
    punctuation: false,
    numbers: false,
    language,
    customText: '',
    codeLanguage: 'js',
    stopOnError: 'off',
    noBackspace: false,
    suddenDeath: false,
  };
  const mode2 = result.mode2;
  switch (result.mode) {
    case 'time':
      return { ...base, mode: 'time', time: Number(mode2) as TimeOption };
    case 'words':
      return { ...base, mode: 'words', words: Number(mode2) as WordsOption };
    case 'quote':
      return { ...base, mode: 'quote', quoteLength: mode2 as QuoteLength };
    case 'pangram':
      return { ...base, mode: 'pangram', pangramCount: Number(mode2) as PangramCount };
    case 'code':
      // Code snippets are English text (the server stores them as language 'en').
      return { ...base, mode: 'code', codeLanguage: mode2 as CodeLanguage, language: 'en' };
    case 'event':
      // An event is typed as a fixed text, which the replay plays back as a custom text.
      return { ...base, mode: 'custom' };
    default:
      return { ...base, mode: result.mode as Mode };
  }
}

/**
 * The state a finished test ended in, for the replay player's last frame. Replaying the log gives the typed
 * text; a time test ended by the timer is finished at its time, which the log does not record.
 */
export function finalStateOf(config: TestConfig, words: readonly string[], events: readonly EngineEvent[], code?: ReplayDto['replay']['code']): EngineState {
  const extras = code ? { code } : undefined;
  const replayed = replayStateAt(config, words, events, Infinity, extras);
  if (replayed.status !== 'running' || replayed.startedAt === null) return replayed;
  const at = config.mode === 'time' ? replayed.startedAt + config.time * 1000 : replayed.startedAt + (events[events.length - 1]?.t ?? 0);
  return engineReducer(replayed, { type: 'finish', at });
}
