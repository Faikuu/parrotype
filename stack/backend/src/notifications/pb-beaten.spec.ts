import { isRankedMode } from '../common/domain';
import { beatenFollowers, isPbBeatenTrigger, PB_BEATEN_FOLLOWER_CAP } from './pb-beaten';

describe('beatenFollowers', () => {
  it('picks the followers whose best is above 0 and below the new wpm', () => {
    const followers = [
      { userId: 1, best: 50 },
      { userId: 2, best: 80 },
      { userId: 3, best: null },
      { userId: 4, best: 0 },
      { userId: 5, best: 70.5 },
    ];
    expect(beatenFollowers(70.5 + 0.5, followers)).toEqual([1, 5]);
  });

  it('does not notify a follower whose best equals the new wpm', () => {
    expect(beatenFollowers(60, [{ userId: 1, best: 60 }])).toEqual([]);
  });

  it('does not notify a follower with no best (they were not beaten, they had none)', () => {
    expect(beatenFollowers(60, [{ userId: 1, best: null }])).toEqual([]);
  });

  it('caps the notified followers at PB_BEATEN_FOLLOWER_CAP, keeping input order', () => {
    const followers = Array.from({ length: PB_BEATEN_FOLLOWER_CAP + 10 }, (_, i) => ({ userId: i + 1, best: 10 }));
    const out = beatenFollowers(100, followers);
    expect(out).toHaveLength(PB_BEATEN_FOLLOWER_CAP);
    expect(out[0]).toBe(1);
    expect(out[out.length - 1]).toBe(PB_BEATEN_FOLLOWER_CAP);
  });

  it('returns nothing without followers', () => {
    expect(beatenFollowers(100, [])).toEqual([]);
  });
});

describe('isPbBeatenTrigger', () => {
  const base = { mode: 'time', verified: true, isNewBest: true };

  it('fires for a verified new best in a ranked mode', () => {
    expect(isPbBeatenTrigger(base, isRankedMode)).toBe(true);
  });

  it('does not fire for an unverified result', () => {
    expect(isPbBeatenTrigger({ ...base, verified: false }, isRankedMode)).toBe(false);
  });

  it('does not fire when the result is not a new best', () => {
    expect(isPbBeatenTrigger({ ...base, isNewBest: false }, isRankedMode)).toBe(false);
  });

  it('does not fire in an unranked mode (code results are never ranked)', () => {
    expect(isPbBeatenTrigger({ ...base, mode: 'code' }, isRankedMode)).toBe(false);
  });
});
