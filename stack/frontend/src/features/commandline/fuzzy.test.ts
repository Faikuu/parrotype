import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches a subsequence and returns the matched indices', () => {
    const m = fuzzyMatch('te', 'Theme');
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([0, 2]);
  });

  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'Theme')).toBeNull();
    expect(fuzzyMatch('meh', 'Theme')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('THEME', 'theme')).not.toBeNull();
    expect(fuzzyMatch('the', 'THEME')).not.toBeNull();
  });

  it('matches everything with score 0 for an empty query', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch('   ', 'anything')).toEqual({ score: 0, indices: [] });
  });

  it('prefers consecutive matches over scattered ones', () => {
    const consecutive = fuzzyMatch('the', 'theme')!;
    const scattered = fuzzyMatch('the', 't-x-h-x-e')!;
    expect(consecutive.score).toBeGreaterThan(scattered.score);
  });

  it('prefers word starts', () => {
    const wordStart = fuzzyMatch('dl', 'data-loader')!;
    const midWord = fuzzyMatch('dl', 'pedxl')!;
    expect(wordStart.score).toBeGreaterThan(midWord.score);
  });
});

describe('fuzzyFilter', () => {
  const items = [
    { label: 'Font size', keywords: ['zoom'] },
    { label: 'Theme', keywords: ['colour', 'color'] },
    { label: 'Caret style', keywords: [] },
  ];
  const label = (i: { label: string }) => i.label;
  const kws = (i: { keywords: string[] }) => i.keywords;

  it('returns all items in order for an empty query', () => {
    const r = fuzzyFilter(items, '', label, kws);
    expect(r.map((x) => x.item.label)).toEqual(['Font size', 'Theme', 'Caret style']);
  });

  it('filters out non-matching items and ranks the best first', () => {
    const r = fuzzyFilter(items, 'the', label, kws);
    expect(r[0]!.item.label).toBe('Theme');
    expect(r.find((x) => x.item.label === 'Caret style')).toBeUndefined();
  });

  it('falls back to keywords without highlighting the label', () => {
    const r = fuzzyFilter(items, 'zoom', label, kws);
    expect(r).toHaveLength(1);
    expect(r[0]!.item.label).toBe('Font size');
    expect(r[0]!.indices).toEqual([]);
  });

  it('returns highlight indices for label matches', () => {
    const r = fuzzyFilter(items, 'caret', label, kws);
    expect(r[0]!.indices).toEqual([0, 1, 2, 3, 4]);
  });
});
