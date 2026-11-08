import { leaderboardQuerySchema, resultInputSchema } from './results.schemas';

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
    expect(resultInputSchema.safeParse({ ...valid, mode: 'zen' }).success).toBe(true);
    expect(resultInputSchema.safeParse({ ...valid, mode: 'custom' }).success).toBe(true);
  });
});

describe('leaderboardQuerySchema', () => {
  it('rejects zen, custom and weak with a message', () => {
    for (const mode of ['zen', 'custom', 'weak']) {
      const r = leaderboardQuerySchema.safeParse({ mode, mode2: 'x', language: 'en' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe('zen, custom and weak results are not ranked');
    }
  });

  it('accepts daily with a date mode2, and rejects a malformed date', () => {
    expect(leaderboardQuerySchema.safeParse({ mode: 'daily', mode2: '2026-11-08', language: 'de' }).success).toBe(true);
    expect(leaderboardQuerySchema.safeParse({ mode: 'daily', mode2: 'today', language: 'en' }).success).toBe(false);
    expect(leaderboardQuerySchema.safeParse({ mode: 'daily', mode2: '2026-1-8', language: 'en' }).success).toBe(false);
  });

  it('accepts the other ranked modes and the four languages', () => {
    for (const mode of ['time', 'words', 'quote', 'pangram']) {
      expect(leaderboardQuerySchema.safeParse({ mode, mode2: '60', language: 'es' }).success).toBe(true);
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
