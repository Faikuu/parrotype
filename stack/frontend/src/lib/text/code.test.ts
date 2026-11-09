import { describe, it, expect } from 'vitest';
import { CODE_SNIPPETS, codeForConfig, codeToWords } from './code';
import { wordsForConfig } from './generator';
import { createRng } from './rng';
import type { CodeLanguage, TestConfig } from '../engine/types';

const LANGUAGES: CodeLanguage[] = ['js', 'py', 'rs', 'go'];
const base: TestConfig = {
  mode: 'code', time: 15, words: 10, quoteLength: 'short', pangramCount: 1,
  punctuation: false, numbers: false, language: 'en', customText: '', stopOnError: 'off',
  noBackspace: false, suddenDeath: false, codeLanguage: 'js',
};

describe('CODE_SNIPPETS', () => {
  it('has about ten snippets per language, with unique ids', () => {
    const ids = LANGUAGES.flatMap((lang) => CODE_SNIPPETS[lang].map((s) => s.id));
    for (const lang of LANGUAGES) {
      expect(CODE_SNIPPETS[lang].length).toBeGreaterThanOrEqual(10);
      expect(CODE_SNIPPETS[lang].every((s) => s.id.startsWith(`${lang}-`))).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const lang of LANGUAGES) {
    for (const snippet of CODE_SNIPPETS[lang]) {
      it(`${snippet.id} meets the constraints`, () => {
        expect(snippet.title.trim().length).toBeGreaterThan(0);
        const lines = snippet.code.split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(4);
        expect(lines.length).toBeLessThanOrEqual(12);
        for (const line of lines) {
          expect(line, 'length').not.toBe('');
          expect(line.length, `${JSON.stringify(line)} is too long`).toBeLessThanOrEqual(70);
          expect(line, 'ASCII only').toMatch(/^[\x20-\x7e]+$/);
          expect(line, 'no tabs').not.toContain('\t');
          expect(line, 'no trailing spaces').not.toMatch(/ $/);
          expect(line, 'no blank lines').not.toMatch(/^ *$/);
        }
        expect(snippet.code.endsWith('\n')).toBe(false);
      });
    }
  }
});

describe('codeToWords', () => {
  it('splits lines on runs of spaces and drops blank lines', () => {
    const code = 'if (a) {\n\n    go();  x\n}\n';
    expect(codeToWords(code)).toEqual({
      words: ['if', '(a)', '{', 'go();', 'x', '}'],
      breaks: [false, false, true, false, true, false],
      indent: [0, 0, 0, 4, 0, 0],
    });
  });

  it('marks the last word of each line as a break, but never the final word', () => {
    const r = codeToWords('a b\nc\nd');
    expect(r.words).toEqual(['a', 'b', 'c', 'd']);
    expect(r.breaks).toEqual([false, true, true, false]);
  });

  it('gives indentation to the first word of a line only', () => {
    const r = codeToWords('x\n      y z\n  w');
    expect(r.indent).toEqual([0, 6, 0, 2]);
    expect(r.words).toEqual(['x', 'y', 'z', 'w']);
  });

  it('handles empty and blank input', () => {
    expect(codeToWords('')).toEqual({ words: [], breaks: [], indent: [] });
    expect(codeToWords('\n   \n\n')).toEqual({ words: [], breaks: [], indent: [] });
  });

  it('a single word is the final word, so it is not a break', () => {
    expect(codeToWords('  solo  ')).toEqual({ words: ['solo'], breaks: [false], indent: [2] });
  });

  it('keeps the words of a snippet in order, with one break per line end', () => {
    const snippet = CODE_SNIPPETS.py[0]!;
    const r = codeToWords(snippet.code);
    expect(r.words.length).toBe(r.breaks.length);
    expect(r.words.length).toBe(r.indent.length);
    const lineEnds = snippet.code.split('\n').length;
    expect(r.breaks.filter(Boolean).length).toBe(lineEnds - 1);
  });
});

describe('codeForConfig', () => {
  it('returns a snippet in the config language with its words and lines', () => {
    for (const lang of LANGUAGES) {
      const sel = codeForConfig({ codeLanguage: lang }, createRng(lang.length));
      expect(CODE_SNIPPETS[lang]).toContainEqual(sel.snippet);
      expect(sel.words).toEqual(codeToWords(sel.snippet.code).words);
      expect(sel.breaks).toEqual(codeToWords(sel.snippet.code).breaks);
      expect(sel.indent).toEqual(codeToWords(sel.snippet.code).indent);
    }
  });

  it('is deterministic for a seed and covers the snippets over many seeds', () => {
    expect(codeForConfig({ codeLanguage: 'go' }, createRng(9))).toEqual(
      codeForConfig({ codeLanguage: 'go' }, createRng(9)),
    );
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) seen.add(codeForConfig({ codeLanguage: 'rs' }, createRng(seed)).snippet.id);
    expect(seen.size).toBe(CODE_SNIPPETS.rs.length);
  });
});

describe('wordsForConfig in code mode', () => {
  it('gives the words of a snippet in the config language', () => {
    for (const lang of LANGUAGES) {
      const words = wordsForConfig({ ...base, codeLanguage: lang }, createRng(3));
      const matches = CODE_SNIPPETS[lang].some((s) => codeToWords(s.code).words.join(' ') === words.join(' '));
      expect(matches, lang).toBe(true);
    }
  });
});
