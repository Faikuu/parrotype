import type {
  CharState,
  EngineAction,
  EngineState,
  Keystroke,
  Mode,
  SecondSample,
  TestConfig,
} from './types';

/** Extra (over-typed) characters allowed per word. */
export const MAX_EXTRA_CHARS = 20;
/** In time mode the UI should append words once fewer than this many remain. */
const LOOKAHEAD_WORDS = 40;

function isZen(config: TestConfig): boolean {
  return config.mode === 'zen';
}

function finishesOnLastWord(mode: Mode): boolean {
  return mode === 'words' || mode === 'quote' || mode === 'pangram' || mode === 'custom';
}

function replaceAt(list: string[], index: number, value: string): string[] {
  const copy = list.slice();
  copy[index] = value;
  return copy;
}

/**
 * Zen's target text is what was typed. The word the caret is on is empty until the user types into it,
 * so it is left out (a single empty word is kept so the list is never empty).
 */
function zenWords(typed: string[]): string[] {
  const last = typed.length - 1;
  return last > 0 && typed[last] === '' ? typed.slice(0, last) : typed.slice();
}

/** True when `typed` already differs from `target` (wrong letter or over-typed). */
function hasError(typed: string, target: string): boolean {
  for (let k = 0; k < typed.length; k++) {
    if (k >= target.length || typed.charAt(k) !== target.charAt(k)) return true;
  }
  return false;
}

export function createInitialState(config: TestConfig, words: string[]): EngineState {
  // Zen has no target text: the typed text is the target, so keep words in step with typed.
  return {
    status: 'idle',
    config,
    words: isZen(config) ? zenWords(['']) : [...words],
    typed: [''],
    current: 0,
    startedAt: null,
    finishedAt: null,
    keystrokes: [],
    samples: [],
    errorsThisSecond: 0,
  };
}

export function engineReducer(state: EngineState, action: EngineAction): EngineState {
  if (action.type === 'reset') return createInitialState(action.config, action.words);
  if (state.status === 'finished') return state;

  switch (action.type) {
    case 'char':
      return onChar(state, action.char, action.at);
    case 'space':
      return onSpace(state, action.at);
    case 'backspace':
      return onBackspace(state, action.word === true);
    case 'newline':
      return isZen(state.config) && state.status === 'running' ? finish(state, action.at) : state;
    case 'tick':
      return onTick(state, action.at);
    case 'append':
      return { ...state, words: [...state.words, ...action.words] };
    case 'finish':
      return state.status === 'running' ? finish(state, action.at) : state;
  }
}

function onChar(state: EngineState, char: string, at: number): EngineState {
  const { config } = state;
  const i = state.current;
  const zen = isZen(config);
  const typedWord = state.typed[i] ?? '';
  const target = zen ? typedWord : (state.words[i] ?? '');

  const correct = zen || target.charAt(typedWord.length) === char;
  const overCap = !zen && typedWord.length >= target.length + MAX_EXTRA_CHARS;
  const insert = !overCap && (correct || config.stopOnError !== 'letter');

  const typed = insert ? replaceAt(state.typed, i, typedWord + char) : state.typed;
  const keystroke: Keystroke = { at, correct };
  const next: EngineState = {
    ...state,
    status: 'running',
    startedAt: state.startedAt ?? at,
    typed,
    words: zen ? zenWords(typed) : state.words,
    keystrokes: [...state.keystrokes, keystroke],
    errorsThisSecond: state.errorsThisSecond + (correct ? 0 : 1),
  };

  const typedLastWord =
    insert &&
    !zen &&
    finishesOnLastWord(config.mode) &&
    i === state.words.length - 1 &&
    target.length > 0 &&
    typed[i] === target;
  return typedLastWord ? finish(next, at) : next;
}

function onSpace(state: EngineState, at: number): EngineState {
  const { config } = state;
  const i = state.current;
  const typedWord = state.typed[i] ?? '';
  if (typedWord.length === 0) return state;

  if (isZen(config)) {
    const typed = [...state.typed, ''];
    return { ...state, typed, words: zenWords(typed), current: i + 1 };
  }

  const target = state.words[i] ?? '';
  if (config.stopOnError === 'word' && hasError(typedWord, target)) return state;
  if (finishesOnLastWord(config.mode) && i === state.words.length - 1) {
    return finish(state, at);
  }
  return { ...state, typed: [...state.typed, ''], current: i + 1 };
}

function onBackspace(state: EngineState, word: boolean): EngineState {
  if (state.status === 'idle') return state;
  const i = state.current;
  const typedWord = state.typed[i] ?? '';

  let next: EngineState;
  if (typedWord.length > 0) {
    next = { ...state, typed: replaceAt(state.typed, i, word ? '' : typedWord.slice(0, -1)) };
  } else if (i > 0 && (isZen(state.config) || !isWordCorrect(state, i - 1))) {
    // Step back into the previous word. Its typed text is kept, unless word-backspace clears it.
    // In zen every word is correct, but going back over a typed space is still allowed.
    const typed = state.typed.slice(0, i);
    if (word) typed[i - 1] = '';
    next = { ...state, typed, current: i - 1 };
  } else {
    return state;
  }

  return isZen(state.config) ? { ...next, words: zenWords(next.typed) } : next;
}

function onTick(state: EngineState, at: number): EngineState {
  if (state.status !== 'running' || state.startedAt === null) return state;
  const start = state.startedAt;
  const limit = state.config.mode === 'time' ? state.config.time * 1000 : Infinity;
  const elapsedRaw = Math.max(0, at - start);
  const elapsed = Math.min(elapsedRaw, limit);
  const wholeSeconds = Math.floor(elapsed / 1000);

  let next = state;
  if (wholeSeconds > state.samples.length) {
    const added: SecondSample[] = [];
    for (let second = state.samples.length + 1; second <= wholeSeconds; second++) {
      const lo = (second - 1) * 1000;
      const hi = second * 1000;
      let typedInSecond = 0;
      let correctInSecond = 0;
      for (const k of state.keystrokes) {
        const rel = k.at - start;
        if (rel >= lo && rel < hi) {
          typedInSecond++;
          if (k.correct) correctInSecond++;
        }
      }
      added.push({
        second,
        wpm: (correctInSecond * 60) / 5,
        raw: (typedInSecond * 60) / 5,
        // Errors since the last sample go on the newest sample; catch-up seconds get 0.
        errors: second === wholeSeconds ? state.errorsThisSecond : 0,
      });
    }
    next = {
      ...state,
      samples: [...state.samples, ...added],
      errorsThisSecond: 0,
    };
  }

  return elapsedRaw >= limit ? finish(next, at) : next;
}

function finish(state: EngineState, at: number): EngineState {
  let end = at;
  if (state.config.mode === 'time' && state.startedAt !== null) {
    end = Math.min(at, state.startedAt + state.config.time * 1000);
  }
  return { ...state, status: 'finished', finishedAt: end };
}

/**
 * Per-character states for word `wordIndex`: target chars first, then extra typed chars.
 * Untyped target chars are `missed` on words the user has left, `pending` otherwise.
 */
export function getCharStates(
  state: EngineState,
  wordIndex: number,
): { char: string; state: CharState }[] {
  const target = state.words[wordIndex] ?? '';
  const typedWord = state.typed[wordIndex] ?? '';
  const left = wordIndex < state.current;
  const out: { char: string; state: CharState }[] = [];

  for (let k = 0; k < target.length; k++) {
    const char = target.charAt(k);
    if (k < typedWord.length) {
      out.push({ char, state: typedWord.charAt(k) === char ? 'correct' : 'incorrect' });
    } else {
      out.push({ char, state: left ? 'missed' : 'pending' });
    }
  }
  for (let k = target.length; k < typedWord.length; k++) {
    out.push({ char: typedWord.charAt(k), state: 'extra' });
  }
  return out;
}

/** True when word `i` was typed exactly (in zen every non-empty word counts as correct). */
export function isWordCorrect(state: EngineState, i: number): boolean {
  const typedWord = state.typed[i];
  if (typedWord === undefined || typedWord.length === 0) return false;
  if (isZen(state.config)) return true;
  return typedWord === (state.words[i] ?? '');
}

export function needsMoreWords(state: EngineState): boolean {
  return state.config.mode === 'time' && state.words.length - state.current < LOOKAHEAD_WORDS;
}

export function elapsedMs(state: EngineState, now: number): number {
  if (state.startedAt === null) return 0;
  let ms = Math.max(0, (state.finishedAt ?? now) - state.startedAt);
  if (state.config.mode === 'time') ms = Math.min(ms, state.config.time * 1000);
  return ms;
}

export function timeLeftMs(state: EngineState, now: number): number | null {
  if (state.config.mode !== 'time') return null;
  return Math.max(0, state.config.time * 1000 - elapsedMs(state, now));
}
