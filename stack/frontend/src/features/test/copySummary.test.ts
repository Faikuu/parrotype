import type { TestConfig, TestResult } from '@/lib/engine/types';
import { copyText, fallbackCopy, summaryText } from './copySummary';

const cfg: TestConfig = {
  mode: 'time',
  time: 30,
  words: 25,
  quoteLength: 'any',
  pangramCount: 1,
  punctuation: false,
  numbers: false,
  language: 'en',
  customText: '',
  stopOnError: 'off',
  noBackspace: false,
  suddenDeath: false, codeLanguage: 'js',
};

const result = {
  failed: false,
  wpm: 92.4,
  rawWpm: 97.6,
  accuracy: 96.8,
  consistency: 80.5,
  durationMs: 30000,
  charStats: { correct: 1, incorrect: 0, extra: 0, missed: 0 },
  samples: [],
  keyStats: {},
} as TestResult;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('summaryText', () => {
  it('formats the two plain-text lines', () => {
    expect(summaryText(cfg, result, '')).toBe(
      'ParroType · time 30 · en\n92 wpm · 97% acc · raw 98 · consistency 81%',
    );
  });

  it('adds punctuation and numbers to the first line', () => {
    expect(summaryText({ ...cfg, punctuation: true, numbers: true, language: 'pl' }, result, '')).toBe(
      'ParroType · time 30 · pl · punctuation · numbers\n92 wpm · 97% acc · raw 98 · consistency 81%',
    );
  });

  it('names the mode for each kind of test', () => {
    expect(summaryText({ ...cfg, mode: 'words', words: 50 }, result, '')).toMatch(/^ParroType · words 50 · en\n/);
    expect(summaryText({ ...cfg, mode: 'zen' }, result, '')).toMatch(/^ParroType · zen · en\n/);
    expect(summaryText({ ...cfg, mode: 'weak', language: 'de' }, result, '')).toMatch(/^ParroType · weak keys · de\n/);
    expect(summaryText({ ...cfg, mode: 'daily' }, result, '2026-11-08')).toMatch(
      /^ParroType · daily 2026-11-08 · en\n/,
    );
  });
});

describe('copyText', () => {
  it('uses the async clipboard API when it is there', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to a hidden textarea and execCommand when the clipboard API refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true });
    try {
      await expect(copyText('fallback text')).resolves.toBe(true);
      expect(exec).toHaveBeenCalledWith('copy');
      // The textarea is removed again.
      expect(document.querySelector('textarea')).toBeNull();
    } finally {
      delete (document as unknown as { execCommand?: unknown }).execCommand;
    }
  });

  it('reports failure when neither route works', () => {
    vi.stubGlobal('navigator', {});
    expect(fallbackCopy('x')).toBe(false);
  });
});
