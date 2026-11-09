import { act, renderHook } from '@testing-library/react';
import { createRng } from '@/lib/text/rng';
import { FUNBOX_IDS, sanitizeFunbox, sanitizeSettings } from '@/store/settings';
import { applyFunboxWords, capsWords, MEMORY_SHOW_MS, reverseWord } from './funbox';
import { useMemoryHide } from './useMemoryHide';

describe('funbox transforms', () => {
  it('reverses the letters of a word, keeping accented letters whole', () => {
    expect(reverseWord('quick')).toBe('kciuq');
    expect(reverseWord('żółw')).toBe('włóż');
    expect(reverseWord('')).toBe('');
  });

  it('capitalises about one word in three, first letter only, and never by changing the length', () => {
    const words = Array.from({ length: 300 }, () => 'alpha');
    const out = capsWords(words, createRng(3));
    const capitalised = out.filter((w) => w === 'Alpha');
    expect(capitalised.length).toBeGreaterThan(60);
    expect(capitalised.length).toBeLessThan(140);
    expect(out.every((w) => w === 'alpha' || w === 'Alpha')).toBe(true);
    // ß has a two-letter capital, so the word is kept as it is.
    expect(capsWords(['ß'], () => 0)).toEqual(['ß']);
  });

  it('applies reverse before caps, and leaves the words alone for mirror and memory', () => {
    const words = ['abc', 'de'];
    expect(applyFunboxWords(words, [])).toEqual(words);
    expect(applyFunboxWords(words, ['mirror', 'memory'])).toEqual(words);
    expect(applyFunboxWords(words, ['reverse'])).toEqual(['cba', 'ed']);
    expect(applyFunboxWords(words, ['reverse', 'caps'], () => 0)).toEqual(['Cba', 'Ed']);
  });

  it('keeps only known, unique funbox ids in their fixed order', () => {
    expect(sanitizeFunbox(['caps', 'mirror', 'mirror', 'bogus', 3])).toEqual(['mirror', 'caps']);
    expect(sanitizeFunbox('mirror')).toEqual([]);
    expect(FUNBOX_IDS).toEqual(['mirror', 'reverse', 'memory', 'caps']);
  });

  it('sanitizes the stored funbox, keyboard, font and scale settings', () => {
    const clean = sanitizeSettings({
      funbox: ['reverse', 'nope'],
      keyboardHints: 'fingers',
      showKeyboard: true,
      uiFont: 'dyslexic',
      uiScale: 1.25,
    });
    expect(clean).toMatchObject({ funbox: ['reverse'], keyboardHints: 'fingers', showKeyboard: true, uiFont: 'dyslexic', uiScale: 1.25 });

    const bad = sanitizeSettings({ keyboardHints: 'loud', uiFont: 'comic', uiScale: 3, funbox: 'mirror' });
    expect(bad).toMatchObject({ keyboardHints: 'next', uiFont: 'default', uiScale: 1, funbox: [] });
  });
});

describe('memory funbox timing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the upcoming words three seconds after the start, and only while it is on', () => {
    const start = Date.now();
    const { result, rerender } = renderHook(({ on, at }: { on: boolean; at: number | null }) => useMemoryHide(on, at), {
      initialProps: { on: true, at: null as number | null },
    });
    expect(result.current).toBe(false);

    rerender({ on: true, at: start });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(MEMORY_SHOW_MS - 100);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);

    rerender({ on: false, at: start });
    expect(result.current).toBe(false);
  });

  it('shows the words again for a new run', () => {
    const start = Date.now();
    const { result, rerender } = renderHook(({ at }: { at: number | null }) => useMemoryHide(true, at), {
      initialProps: { at: start as number | null },
    });
    act(() => {
      vi.advanceTimersByTime(MEMORY_SHOW_MS + 50);
    });
    expect(result.current).toBe(true);
    rerender({ at: null });
    expect(result.current).toBe(false);
  });
});
