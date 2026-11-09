import { liveWpm, maxCharsAt, round2, wpmFor, clampPercent } from './race-rules';

describe('race rules', () => {
  describe('maxCharsAt', () => {
    it('allows 15 characters at the start, then 350 wpm (1750 chars a minute)', () => {
      expect(maxCharsAt(0)).toBe(15);
      expect(maxCharsAt(1000)).toBe(44); // floor(1750 / 60) + 15
      expect(maxCharsAt(60_000)).toBe(1765);
    });

    it('treats a negative elapsed time as zero', () => {
      expect(maxCharsAt(-5000)).toBe(15);
    });
  });

  describe('wpmFor (server-computed)', () => {
    it('is (chars / 5) per minute of the duration, rounded to 2 decimals', () => {
      expect(wpmFor(10, 60_000)).toBe(2);
      expect(wpmFor(11, 400)).toBe(330);
      expect(wpmFor(1, 7)).toBe(round2(0.2 / (7 / 60_000)));
    });

    it('is infinite for a zero or negative duration', () => {
      expect(wpmFor(11, 0)).toBe(Infinity);
      expect(wpmFor(11, -1)).toBe(Infinity);
    });
  });

  describe('liveWpm', () => {
    it('is the client claim when it is below the implied pace and the limit', () => {
      expect(liveWpm(10, 5, 3000)).toBe(10);
    });

    it('is the server-implied pace when the client claims more', () => {
      // 5 chars in 3 s is 20 wpm.
      expect(liveWpm(300, 5, 3000)).toBe(20);
    });

    it('is capped at 350', () => {
      // 102 chars in 3 s is 408 wpm; the client claims 500.
      expect(liveWpm(500, 102, 3000)).toBe(350);
    });

    it('uses the client claim, capped at 350, when no time has passed', () => {
      expect(liveWpm(120, 5, 0)).toBe(120);
      expect(liveWpm(900, 5, 0)).toBe(350);
    });
  });

  describe('clampPercent', () => {
    it('clamps to 0-100 and keeps values in range', () => {
      expect(clampPercent(150)).toBe(100);
      expect(clampPercent(-3)).toBe(0);
      expect(clampPercent(96.5)).toBe(96.5);
    });
  });
});
