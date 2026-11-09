import { isSuspicious, suspiciousWhere } from './suspicious';

const clean = { wpm: 90, rawWpm: 95, accuracy: 97, consistency: 80 };

describe('isSuspicious', () => {
  it('leaves an ordinary result alone', () => {
    expect(isSuspicious(clean)).toBe(false);
  });

  it('flags a fast result with uneven pace: wpm >= 180 and consistency < 40', () => {
    expect(isSuspicious({ ...clean, wpm: 180, rawWpm: 200, consistency: 39 })).toBe(true);
    expect(isSuspicious({ ...clean, wpm: 180, rawWpm: 200, consistency: 40 })).toBe(false);
    expect(isSuspicious({ ...clean, wpm: 179, rawWpm: 200, consistency: 10 })).toBe(false);
  });

  it('flags a wpm above the raw wpm, and not a wpm equal to it', () => {
    expect(isSuspicious({ ...clean, wpm: 91, rawWpm: 90 })).toBe(true);
    expect(isSuspicious({ ...clean, wpm: 90, rawWpm: 90 })).toBe(false);
  });

  it('flags a fast result with low accuracy: accuracy < 75 and wpm >= 150', () => {
    expect(isSuspicious({ ...clean, wpm: 150, rawWpm: 160, accuracy: 74.9 })).toBe(true);
    expect(isSuspicious({ ...clean, wpm: 150, rawWpm: 160, accuracy: 75 })).toBe(false);
    expect(isSuspicious({ ...clean, wpm: 149, rawWpm: 160, accuracy: 60 })).toBe(false);
  });
});

describe('suspiciousWhere', () => {
  it('is an OR of the three clauses, with the ids for the raw-wpm clause', () => {
    expect(suspiciousWhere([4, 9])).toEqual({
      OR: [
        { wpm: { gte: 180 }, consistency: { lt: 40 } },
        { wpm: { gte: 150 }, accuracy: { lt: 75 } },
        { id: { in: [4, 9] } },
      ],
    });
  });

  it('matches nothing for the raw-wpm clause when there are no such ids', () => {
    expect(suspiciousWhere([])).toMatchObject({ OR: expect.arrayContaining([{ id: { in: [] } }]) });
  });
});
