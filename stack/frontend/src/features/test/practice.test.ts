import { describe, expect, it } from 'vitest';
import { practiceText, PRACTICE_WORDS } from './practice';

describe('practiceText', () => {
  it('builds about 30 words from the given words', () => {
    const text = practiceText(['alpha', 'beta', 'gamma']);
    const out = text.split(' ');
    expect(out).toHaveLength(PRACTICE_WORDS);
    expect(new Set(out)).toEqual(new Set(['alpha', 'beta', 'gamma']));
  });

  it('repeats every word equally when the list is a divisor of the target', () => {
    const out = practiceText(['a', 'b', 'c', 'd', 'e'], 30, () => 0.5).split(' ');
    for (const w of ['a', 'b', 'c', 'd', 'e']) {
      expect(out.filter((x) => x === w)).toHaveLength(6);
    }
  });

  it('shuffles each pass, so the order changes between passes', () => {
    const words = ['one', 'two', 'three', 'four', 'five'];
    const out = practiceText(words, 10, () => 0.01).split(' ');
    // Both passes are shuffled with the same random source, so they match exactly.
    expect(out.slice(0, 5)).toEqual(out.slice(5, 10));
    expect(out.slice(0, 5)).not.toEqual(words);
  });

  it('returns an empty string when there is nothing to practise', () => {
    expect(practiceText([])).toBe('');
    expect(practiceText([''])).toBe('');
  });

  it('keeps the requested length when it is not a multiple of the list', () => {
    expect(practiceText(['x', 'y', 'z'], 7).split(' ')).toHaveLength(7);
  });
});
