/** A random source returning floats in [0, 1). */
export type Rng = () => number;

/** Seeded PRNG (mulberry32). Without a seed it is seeded from Math.random. */
export function createRng(seed?: number): Rng {
  let a = (seed ?? Math.floor(Math.random() * 0x100000000)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random element of a non-empty array. */
export function pick<T>(arr: readonly T[], rng: Rng = Math.random): T {
  if (arr.length === 0) throw new Error('pick: empty array');
  const index = Math.min(arr.length - 1, Math.floor(rng() * arr.length));
  return arr[index] as T;
}

/** Non-mutating Fisher-Yates shuffle. */
export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
