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
    expect(resultInputSchema.safeParse({ ...valid, language: 'de' }).success).toBe(false);
    expect(resultInputSchema.safeParse({ ...valid, charStats: { ...valid.charStats, extra: -1 } }).success).toBe(false);
  });

  it('accepts zen and custom results (they are saved, just not ranked)', () => {
    expect(resultInputSchema.safeParse({ ...valid, mode: 'zen' }).success).toBe(true);
    expect(resultInputSchema.safeParse({ ...valid, mode: 'custom' }).success).toBe(true);
  });
});

describe('leaderboardQuerySchema', () => {
  it('rejects zen and custom with a message', () => {
    for (const mode of ['zen', 'custom']) {
      const r = leaderboardQuerySchema.safeParse({ mode, mode2: 'x', language: 'en' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe('zen and custom results are not ranked');
    }
  });

  it('accepts ranked modes', () => {
    expect(leaderboardQuerySchema.safeParse({ mode: 'time', mode2: '60', language: 'en' }).success).toBe(true);
  });
});
