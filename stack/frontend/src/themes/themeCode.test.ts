import { describe, expect, it } from 'vitest';
import { decodeThemeCode, encodeThemeCode, THEME_CODE_PREFIX } from './themeCode';
import { getTheme } from './themes';

const KEA = getTheme('kea').tokens;

describe('theme codes', () => {
  it('encodes with the pt1. prefix and no padding or unsafe characters', () => {
    const code = encodeThemeCode(KEA);
    expect(code.startsWith(THEME_CODE_PREFIX)).toBe(true);
    expect(code.slice(THEME_CODE_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('round-trips every built-in theme', () => {
    for (const id of ['kea', 'kakapo', 'macaw', 'cockatoo', 'galah', 'lorikeet', 'budgie', 'cacatua-noir'] as const) {
      const tokens = getTheme(id).tokens;
      expect(decodeThemeCode(encodeThemeCode(tokens))).toEqual(tokens);
    }
  });

  it('accepts surrounding whitespace and normalises hex to lowercase', () => {
    const upper = { ...KEA, bg: '#1D2119', text: '#E4E3D3' };
    const code = encodeThemeCode(upper);
    expect(decodeThemeCode(`  ${code}\n`)).toEqual({ ...KEA, bg: '#1d2119', text: '#e4e3d3' });
  });

  it('ignores extra keys in the JSON', () => {
    const json = JSON.stringify({ ...KEA, extra: 'x' });
    expect(decodeThemeCode(`pt1.${base64Url(json)}`)).toEqual(KEA);
  });

  it.each([
    ['empty string', ''],
    ['wrong prefix', `pt2.${base64Url(JSON.stringify(KEA))}`],
    ['no prefix', base64Url(JSON.stringify(KEA))],
    ['prefix only', 'pt1.'],
    ['not base64', 'pt1.!!!not-base64!!!'],
    ['invalid base64 length', 'pt1.a'],
    ['not JSON', `pt1.${base64Url('{not json')}`],
    ['JSON array', `pt1.${base64Url('[]')}`],
    ['JSON null', `pt1.${base64Url('null')}`],
    ['missing a field', `pt1.${base64Url(JSON.stringify({ ...KEA, caret: undefined }))}`],
    ['short hex', `pt1.${base64Url(JSON.stringify({ ...KEA, bg: '#123' }))}`],
    ['hex without #', `pt1.${base64Url(JSON.stringify({ ...KEA, bg: '1d2119' }))}`],
    ['non-string value', `pt1.${base64Url(JSON.stringify({ ...KEA, bg: 1234567 }))}`],
    ['invalid UTF-8', `pt1.${bytesToBase64Url(new Uint8Array([0xff, 0xfe, 0x7b]))}`],
  ])('rejects %s', (_label, code) => {
    expect(decodeThemeCode(code)).toBeNull();
  });

  it('rejects an absurdly long code', () => {
    expect(decodeThemeCode(`pt1.${'A'.repeat(2000)}`)).toBeNull();
  });
});

function base64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
