import { FORGOT_JITTER_MS, FORGOT_MIN_MS, padResponse, realPaceDeps, type PaceDeps } from './response-timing';

/** A clock and sleep the test moves by hand: sleep advances the clock. */
function fakeDeps(start: number, jitter = 0): PaceDeps & { clock: { t: number }; slept: number[] } {
  const clock = { t: start };
  const slept: number[] = [];
  return {
    clock,
    slept,
    now: () => clock.t,
    sleep: async (ms) => {
      slept.push(ms);
      clock.t += ms;
    },
    jitter: () => jitter,
  };
}

describe('padResponse (forgot-password timing)', () => {
  it('pads a fast answer to 400 ms plus the jitter', async () => {
    const deps = fakeDeps(1_000, 37);
    const waited = await padResponse(1_000, deps);
    expect(waited).toBe(FORGOT_MIN_MS + 37);
    expect(deps.slept).toEqual([FORGOT_MIN_MS + 37]);
    expect(deps.clock.t - 1_000).toBe(FORGOT_MIN_MS + 37);
  });

  it('counts the time already spent: a 250 ms answer waits the rest', async () => {
    const deps = fakeDeps(1_000, 0);
    deps.clock.t = 1_250;
    await padResponse(1_000, deps);
    expect(deps.slept).toEqual([150]);
  });

  it('never waits when the answer already took longer than the target', async () => {
    const deps = fakeDeps(1_000, 100);
    deps.clock.t = 1_900;
    expect(await padResponse(1_000, deps)).toBe(0);
    expect(deps.slept).toEqual([]);
  });

  it('the real jitter is a whole number from 0 to 100 ms', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const j = realPaceDeps.jitter();
      expect(Number.isInteger(j)).toBe(true);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThanOrEqual(FORGOT_JITTER_MS);
      seen.add(j);
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('the wait for an unknown email and a known one is the same shape, so the timing does not tell them apart', async () => {
    const known = fakeDeps(0, 50);
    const unknown = fakeDeps(0, 50);
    known.clock.t = 30;
    unknown.clock.t = 5;
    await padResponse(0, known);
    await padResponse(0, unknown);
    expect(known.clock.t).toBe(unknown.clock.t);
    expect(known.clock.t).toBe(FORGOT_MIN_MS + 50);
  });
});
