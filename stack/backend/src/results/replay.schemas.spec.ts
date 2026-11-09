import { replaySchema, resultInputSchema, REPLAY_MAX_EVENTS, REPLAY_MAX_WORDS, REPLAY_MAX_WORD_LENGTH } from './results.schemas';

const replay = (over: Record<string, unknown> = {}) => ({
  v: 1,
  words: ['the', 'fox'],
  events: [
    { t: 0, k: 'c', ch: 't' },
    { t: 120, k: 'c', ch: 'h' },
  ],
  ...over,
});

/** A valid words result (10 words) with the given replay. The rawWpm check passes for these charStats. */
const result = (over: Record<string, unknown> = {}) => ({
  mode: 'words',
  mode2: '10',
  language: 'en',
  wpm: 60,
  rawWpm: 62,
  accuracy: 98,
  consistency: 90,
  durationMs: 10_000,
  charStats: { correct: 50, incorrect: 1, extra: 0, missed: 0 },
  punctuation: false,
  numbers: false,
  ...over,
});

const issuesOf = (value: unknown) => {
  const parsed = replaySchema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message);
};

describe('replaySchema caps and shape', () => {
  it('accepts a small valid replay', () => {
    expect(replaySchema.safeParse(replay()).success).toBe(true);
  });

  it('accepts exactly the word and event caps, and rejects one more', () => {
    const words = Array.from({ length: REPLAY_MAX_WORDS }, () => 'a'.repeat(REPLAY_MAX_WORD_LENGTH));
    expect(replaySchema.safeParse(replay({ words })).success).toBe(true);
    expect(replaySchema.safeParse(replay({ words: [...words, 'a'] })).success).toBe(false);
    expect(replaySchema.safeParse(replay({ words: ['a'.repeat(REPLAY_MAX_WORD_LENGTH + 1)] })).success).toBe(false);

    const events: Array<{ t: number; k: string; ch?: string }> = Array.from({ length: REPLAY_MAX_EVENTS }, (_, i) => ({ t: i, k: 's' }));
    events[0] = { t: 0, k: 'c', ch: 'a' };
    expect(replaySchema.safeParse(replay({ events })).success).toBe(true);
    expect(replaySchema.safeParse(replay({ events: [...events, { t: REPLAY_MAX_EVENTS, k: 's' }] })).success).toBe(false);
  });

  it('requires the event times to be whole and never to decrease', () => {
    expect(issuesOf(replay({ events: [{ t: 0, k: 'c', ch: 'a' }, { t: 50, k: 's' }, { t: 40, k: 's' }] }))).toContain(
      "t must not decrease",
    );
    expect(replaySchema.safeParse(replay({ events: [{ t: 0, k: 'c', ch: 'a' }, { t: 1.5, k: 's' }] })).success).toBe(false);
    expect(replaySchema.safeParse(replay({ events: [{ t: -1, k: 'c', ch: 'a' }] })).success).toBe(false);
  });

  it('accepts only the event kinds c s b B n', () => {
    expect(replaySchema.safeParse(replay({ events: [{ t: 0, k: 'c', ch: 'a' }, { t: 1, k: 'x' }] })).success).toBe(false);
    for (const k of ['s', 'b', 'B', 'n']) {
      expect(replaySchema.safeParse(replay({ events: [{ t: 0, k: 'c', ch: 'a' }, { t: 1, k }] })).success).toBe(true);
    }
  });

  it('needs one printable character in ch for a "c" event, and no ch otherwise', () => {
    const with_ch = (e: object) => replay({ events: [{ t: 0, k: 'c', ch: 'a' }, e] });
    expect(replaySchema.safeParse(with_ch({ t: 1, k: 'c' })).success).toBe(false);
    expect(replaySchema.safeParse(with_ch({ t: 1, k: 'c', ch: 'ab' })).success).toBe(false);
    expect(replaySchema.safeParse(with_ch({ t: 1, k: 'c', ch: ' ' })).success).toBe(false);
    expect(replaySchema.safeParse(with_ch({ t: 1, k: 'c', ch: 'ż' })).success).toBe(true);
    expect(replaySchema.safeParse(with_ch({ t: 1, k: 's', ch: 'a' })).success).toBe(false);
  });

  it('starts the log with a "c" at t 0', () => {
    expect(replaySchema.safeParse(replay({ events: [{ t: 5, k: 'c', ch: 'a' }] })).success).toBe(false);
    expect(replaySchema.safeParse(replay({ events: [{ t: 0, k: 's' }] })).success).toBe(false);
  });

  it('needs code breaks and indent to have one entry per word, and the version to be 1', () => {
    const code = { breaks: [false], indent: [0, 2] };
    expect(replaySchema.safeParse(replay({ code })).success).toBe(false);
    expect(replaySchema.safeParse(replay({ code: { breaks: [false, true], indent: [0, 2] } })).success).toBe(true);
    expect(replaySchema.safeParse(replay({ v: 2 })).success).toBe(false);
  });
});

describe('resultInputSchema with a replay', () => {
  it('accepts a result with a replay, and without one', () => {
    expect(resultInputSchema.safeParse(result({ replay: replay() })).success).toBe(true);
    expect(resultInputSchema.safeParse(result()).success).toBe(true);
  });

  it('requires a replay for an event, and a slug for its mode2', () => {
    const event = result({ mode: 'event', mode2: 'spring-cup' });
    expect(resultInputSchema.safeParse(event).success).toBe(false);
    expect(resultInputSchema.safeParse({ ...event, replay: replay() }).success).toBe(true);
    expect(resultInputSchema.safeParse({ ...event, mode2: 'Not A Slug', replay: replay() }).success).toBe(false);
  });

  it('requires replay.code for code results, and refuses it elsewhere', () => {
    const code = result({ mode: 'code', mode2: 'js', language: 'en' });
    expect(resultInputSchema.safeParse({ ...code, replay: replay() }).success).toBe(false);
    expect(resultInputSchema.safeParse({ ...code, replay: replay({ words: ['a', 'b'], code: { breaks: [false, false], indent: [0, 0] } }) }).success).toBe(true);
    expect(resultInputSchema.safeParse(result({ replay: replay({ code: { breaks: [false, false], indent: [0, 0] } }) })).success).toBe(false);
  });

  it('rejects an oversized replay through the event cap', () => {
    const events = [{ t: 0, k: 'c', ch: 'a' }, ...Array.from({ length: REPLAY_MAX_EVENTS }, (_, i) => ({ t: i + 1, k: 's' }))];
    expect(resultInputSchema.safeParse(result({ replay: replay({ events }) })).success).toBe(false);
  });
});
