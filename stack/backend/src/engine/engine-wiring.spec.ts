import { computeResult, createInitialState, engineReducer } from '@parrotype/engine';
import type { EngineState, TestConfig } from '@parrotype/engine';

// Smoke test: proves the backend resolves the shared engine package. It types the two words "cat dog".
const config: TestConfig = {
  mode: 'words', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false, codeLanguage: 'js',
};

function typeWord(state: EngineState, word: string, at: number): EngineState {
  let s = state;
  let t = at;
  for (const ch of word) {
    s = engineReducer(s, { type: 'char', char: ch, at: t });
    t += 100;
  }
  return s;
}

describe('@parrotype/engine wiring', () => {
  it('runs a two-word test to a finished, error-free result', () => {
    let s = createInitialState(config, ['cat', 'dog']);
    s = typeWord(s, 'cat', 0);
    s = engineReducer(s, { type: 'space', at: 300 });
    s = typeWord(s, 'dog', 400);
    s = engineReducer(s, { type: 'space', at: 700 });

    expect(s.status).toBe('finished');
    const result = computeResult(s);
    expect(result.failed).toBe(false);
    expect(result.charStats).toEqual({ correct: 6, incorrect: 0, extra: 0, missed: 0 });
    expect(result.accuracy).toBe(100);
  });
});
