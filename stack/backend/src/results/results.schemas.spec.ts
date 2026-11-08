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

  it('rejects wpm that does not match charStats and duration', () => {
    // 400 correct chars in a minute is about 80 wpm, so claiming 10 is more than wpm*1.5+10 off.
    const r = resultInputSchema.safeParse({ ...valid, wpm: 10, rawWpm: 12 });
    expect(r.success).toBe(false);
    // Within tolerance (80 vs 75 is fine) is accepted.
    expect(resultInputSchema.safeParse({ ...valid, wpm: 75, rawWpm: 80 }).success).toBe(true);
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
