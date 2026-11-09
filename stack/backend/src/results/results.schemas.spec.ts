import { badgeQuerySchema, leaderboardQuerySchema, resultInputSchema } from './results.schemas';

const valid = {
  mode: 'time',
  mode2: '60',
  language: 'en',
  wpm: 80,
  rawWpm: 85,
  accuracy: 97.5,
  consistency: 90,
  durationMs: 60_000,
  // 400 correct chars over 1 minute is 80 wpm.
  charStats: { correct: 400, incorrect: 10, extra: 0, missed: 0 },
  punctuation: false,
  numbers: false,
};

describe('resultInputSchema', () => {
  it('accepts a consistent result', () => {
    expect(resultInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects wpm above rawWpm + 0.5', () => {
    const r = resultInputSchema.safeParse({ ...valid, wpm: 90, rawWpm: 85 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('wpm cannot be higher than rawWpm');
  });

  it('rejects rawWpm that does not match charStats and duration', () => {
    // 410 typed chars in a minute is about 82 raw wpm, so claiming 12 is far outside tolerance.
    const r = resultInputSchema.safeParse({ ...valid, wpm: 10, rawWpm: 12 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain('rawWpm does not match charStats and durationMs');
    // Within tolerance (82 vs 80) is accepted.
    expect(resultInputSchema.safeParse({ ...valid, wpm: 75, rawWpm: 80 }).success).toBe(true);
  });

  it('accepts a 60s test at 80 wpm', () => {
    expect(resultInputSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a low-wpm test with many one-letter mistakes', () => {
    // 50 words of 5 letters, each with its last letter wrong: wpm 0 (no fully correct word),
    // but 250 typed chars in 30s is 100 raw wpm and correct is 200.
    const r = resultInputSchema.safeParse({
      ...valid,
      wpm: 0,
      rawWpm: 100,
      accuracy: 80,
      durationMs: 30_000,
      charStats: { correct: 200, incorrect: 50, extra: 0, missed: 0 },
    });
    expect(r.success).toBe(true);
  });

  it('accepts raw speed inflated by spaces that are not in charStats', () => {
    // 410 typed letters in 60s is 82 raw wpm; with about 25% extra for spaces it is about 102.
    expect(resultInputSchema.safeParse({ ...valid, wpm: 80, rawWpm: 102 }).success).toBe(true);
  });

  it('rejects a forged payload: high wpm with almost no typed characters', () => {
    const r = resultInputSchema.safeParse({
      ...valid,
      wpm: 300,
      rawWpm: 300,
      durationMs: 60_000,
      charStats: { correct: 10, incorrect: 0, extra: 0, missed: 0 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects out-of-range values and unknown modes', () => {
    expect(resultInputSchema.safeParse({ ...valid, accuracy: 101 }).success).toBe(false);
    expect(resultInputSchema.safeParse({ ...valid, durationMs: 999 }).success).toBe(false);
    expect(resultInputSchema.safeParse({ ...valid, durationMs: 1.5 }).success).toBe(false);
    expect(resultInputSchema.safeParse({ ...valid, mode: 'hard' }).success).toBe(false);
    expect(resultInputSchema.safeParse({ ...valid, language: 'fr' }).success).toBe(false);
    expect(resultInputSchema.safeParse({ ...valid, charStats: { ...valid.charStats, extra: -1 } }).success).toBe(false);
  });

  it('accepts zen and custom results (they are saved, just not ranked)', () => {
    expect(resultInputSchema.safeParse({ ...valid, mode: 'zen', mode2: 'zen' }).success).toBe(true);
    expect(resultInputSchema.safeParse({ ...valid, mode: 'custom', mode2: 'custom' }).success).toBe(true);
  });
});

describe('mode2 per mode', () => {
  const messages = (r: ReturnType<typeof resultInputSchema.safeParse>) =>
    r.success ? [] : r.error.issues.map((i) => i.message);
  const withMode = (mode: string, mode2: string) => resultInputSchema.safeParse({ ...valid, mode, mode2 });

  it('accepts each time, words, quote and pangram value the frontend sends', () => {
    for (const mode2 of ['15', '30', '60', '120']) expect(withMode('time', mode2).success).toBe(true);
    for (const mode2 of ['10', '25', '50', '100']) expect(withMode('words', mode2).success).toBe(true);
    for (const mode2 of ['short', 'medium', 'long', 'any']) expect(withMode('quote', mode2).success).toBe(true);
    for (const mode2 of ['1', '3', '5']) expect(withMode('pangram', mode2).success).toBe(true);
  });

  it('rejects values that are not in the mode list', () => {
    expect(messages(withMode('time', '45'))).toEqual(['time results must have mode2 one of 15, 30, 60, 120']);
    expect(messages(withMode('words', '30'))).toEqual(['words results must have mode2 one of 10, 25, 50, 100']);
    expect(messages(withMode('quote', 'huge'))).toEqual(['quote results must have mode2 one of short, medium, long, any']);
    expect(messages(withMode('pangram', '2'))).toEqual(['pangram results must have mode2 one of 1, 3, 5']);
    expect(withMode('time', '60s').success).toBe(false);
    expect(withMode('words', '').success).toBe(false);
  });

  it('requires the exact mode name for zen, custom and weak', () => {
    expect(messages(withMode('zen', '60'))).toEqual(['zen results must have mode2 "zen"']);
    expect(messages(withMode('custom', 'zen'))).toEqual(['custom results must have mode2 "custom"']);
    expect(messages(withMode('weak', 'weak'))).toEqual([]);
    expect(messages(withMode('weak', 'zen'))).toEqual(['weak results must have mode2 "weak"']);
  });

  it('rejects a time mode2 on a words result and the reverse', () => {
    expect(withMode('words', '60').success).toBe(false);
    expect(withMode('time', '25').success).toBe(false);
  });
});

describe('leaderboardQuerySchema mode2 per mode', () => {
  const q = (mode: string, mode2: string) => leaderboardQuerySchema.safeParse({ mode, mode2, language: 'en' });

  it('accepts the same values as results, per mode', () => {
    expect(q('time', '120').success).toBe(true);
    expect(q('words', '100').success).toBe(true);
    expect(q('quote', 'any').success).toBe(true);
    expect(q('pangram', '5').success).toBe(true);
    expect(q('time', '45').success).toBe(false);
    expect(q('words', '15').success).toBe(false);
    expect(q('quote', 'tiny').success).toBe(false);
    expect(q('pangram', '4').success).toBe(false);
  });

  it('accepts any well-formed date for daily, and the unranked modes keep their own message', () => {
    expect(q('daily', '2001-02-03').success).toBe(true);
    expect(q('daily', '2001-2-3').success).toBe(false);
    const zen = q('zen', 'zen');
    expect(zen.success).toBe(false);
    if (!zen.success) expect(zen.error.issues.map((i) => i.message)).toEqual(['zen, custom, weak and code results are not ranked']);
  });
});

describe('leaderboardQuerySchema', () => {
  it('rejects zen, custom and weak with a message', () => {
    for (const mode of ['zen', 'custom', 'weak']) {
      const r = leaderboardQuerySchema.safeParse({ mode, mode2: 'x', language: 'en' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe('zen, custom, weak and code results are not ranked');
    }
  });

  it('accepts daily with a date mode2, and rejects a malformed date', () => {
    expect(leaderboardQuerySchema.safeParse({ mode: 'daily', mode2: '2026-11-08', language: 'de' }).success).toBe(true);
    expect(leaderboardQuerySchema.safeParse({ mode: 'daily', mode2: 'today', language: 'en' }).success).toBe(false);
    expect(leaderboardQuerySchema.safeParse({ mode: 'daily', mode2: '2026-1-8', language: 'en' }).success).toBe(false);
  });

  it('accepts the other ranked modes with their own mode2 and all four languages', () => {
    const mode2For = { time: '60', words: '25', quote: 'medium', pangram: '3' } as const;
    for (const [mode, mode2] of Object.entries(mode2For)) {
      for (const language of ['en', 'pl', 'de', 'es']) {
        expect(leaderboardQuerySchema.safeParse({ mode, mode2, language }).success).toBe(true);
      }
    }
  });

  it('accepts ranked modes', () => {
    expect(leaderboardQuerySchema.safeParse({ mode: 'time', mode2: '60', language: 'en' }).success).toBe(true);
  });
});

describe('daily and weak result validation', () => {
  // Fixed clock: 8 Nov 2026, 12:00 UTC.
  beforeEach(() => jest.useFakeTimers({ now: Date.parse('2026-11-08T12:00:00Z') }));
  afterEach(() => jest.useRealTimers());

  const daily = (mode2: string) => ({ ...valid, mode: 'daily', mode2, language: 'en' });
  const messages = (r: ReturnType<typeof resultInputSchema.safeParse>) =>
    r.success ? [] : r.error.issues.map((i) => i.message);

  it("accepts today's and yesterday's UTC date", () => {
    expect(resultInputSchema.safeParse(daily('2026-11-08')).success).toBe(true);
    expect(resultInputSchema.safeParse(daily('2026-11-07')).success).toBe(true);
  });

  it('rejects a stale or future date with the daily message', () => {
    for (const mode2 of ['2026-11-06', '2026-11-09', '2025-11-08']) {
      const r = resultInputSchema.safeParse(daily(mode2));
      expect(r.success).toBe(false);
      expect(messages(r)).toContain("Daily results are only accepted for today's challenge");
    }
  });

  it('rejects a malformed or impossible date', () => {
    expect(resultInputSchema.safeParse(daily('2026-11-8')).success).toBe(false);
    expect(resultInputSchema.safeParse(daily('2026-11-31')).success).toBe(false);
    expect(resultInputSchema.safeParse(daily('today')).success).toBe(false);
  });

  it('rolls the window over at UTC midnight', () => {
    jest.setSystemTime(Date.parse('2026-11-09T00:00:01Z'));
    // 8 Nov is now yesterday, so it is still accepted; 7 Nov is too old.
    expect(resultInputSchema.safeParse(daily('2026-11-08')).success).toBe(true);
    expect(resultInputSchema.safeParse(daily('2026-11-07')).success).toBe(false);
  });

  it('requires mode2 "weak" for weak results', () => {
    expect(resultInputSchema.safeParse({ ...valid, mode: 'weak', mode2: 'weak' }).success).toBe(true);
    const r = resultInputSchema.safeParse({ ...valid, mode: 'weak', mode2: '60' });
    expect(r.success).toBe(false);
    expect(messages(r)).toContain('weak results must have mode2 "weak"');
  });

  it('accepts the de and es languages', () => {
    expect(resultInputSchema.safeParse({ ...valid, language: 'de' }).success).toBe(true);
    expect(resultInputSchema.safeParse({ ...valid, language: 'es' }).success).toBe(true);
  });
});

describe('code mode', () => {
  const code = (mode2: string, extra: Record<string, unknown> = {}) =>
    resultInputSchema.safeParse({ ...valid, mode: 'code', mode2, ...extra });
  const messages = (r: ReturnType<typeof resultInputSchema.safeParse>) =>
    r.success ? [] : r.error.issues.map((i) => i.message);

  it('accepts js, py, rs and go with language en', () => {
    for (const mode2 of ['js', 'py', 'rs', 'go']) expect(code(mode2).success).toBe(true);
  });

  it('rejects other code languages and other UI languages', () => {
    expect(messages(code('c'))).toEqual(['code results must have mode2 one of js, py, rs, go']);
    expect(messages(code('js', { language: 'pl' }))).toEqual(['code results must have language "en"']);
  });

  it('does not accept the lesson mode, which is local only', () => {
    expect(resultInputSchema.safeParse({ ...valid, mode: 'lesson', mode2: 'x' }).success).toBe(false);
  });

  it('is never on a leaderboard, and the badge refuses it', () => {
    const lb = leaderboardQuerySchema.safeParse({ mode: 'code', mode2: 'js', language: 'en' });
    expect(lb.success).toBe(false);
    expect(badgeQuerySchema.safeParse({ mode: 'code', mode2: 'js' }).success).toBe(false);
  });
});

describe('leaderboardQuerySchema scope', () => {
  const base = { mode: 'time', mode2: '60', language: 'en' };

  it('defaults to all and accepts following', () => {
    expect(leaderboardQuerySchema.parse(base).scope).toBe('all');
    expect(leaderboardQuerySchema.parse({ ...base, scope: 'following' }).scope).toBe('following');
    expect(leaderboardQuerySchema.safeParse({ ...base, scope: 'friends' }).success).toBe(false);
  });
});

describe('badgeQuerySchema', () => {
  it('defaults to time, 60 and en', () => {
    expect(badgeQuerySchema.parse({})).toEqual({ mode: 'time', mode2: '60', language: 'en' });
  });

  it('validates mode2 the way the leaderboard does', () => {
    expect(badgeQuerySchema.safeParse({ mode: 'words', mode2: '25' }).success).toBe(true);
    expect(badgeQuerySchema.safeParse({ mode: 'words', mode2: '60' }).success).toBe(false);
    expect(badgeQuerySchema.safeParse({ mode: 'zen', mode2: 'zen' }).success).toBe(false);
    expect(badgeQuerySchema.safeParse({ mode: 'daily', mode2: '2026-11-09' }).success).toBe(true);
  });
});
