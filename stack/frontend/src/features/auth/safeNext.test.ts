import { safeNext } from './safeNext';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/account')).toBe('/account');
    expect(safeNext('/leaderboard?mode=words&mode2=25')).toBe('/leaderboard?mode=words&mode2=25');
  });

  it('falls back when missing or empty', () => {
    expect(safeNext(null)).toBe('/account');
    expect(safeNext(undefined)).toBe('/account');
    expect(safeNext('')).toBe('/account');
    expect(safeNext(null, '/')).toBe('/');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeNext('https://evil.example')).toBe('/account');
    expect(safeNext('//evil.example')).toBe('/account');
    expect(safeNext('///evil.example')).toBe('/account');
    expect(safeNext('javascript:alert(1)')).toBe('/account');
  });

  it('rejects backslash tricks and control characters', () => {
    expect(safeNext('/\\evil.example')).toBe('/account');
    expect(safeNext('/\t/evil.example')).toBe('/account');
    expect(safeNext('/\n/evil.example')).toBe('/account');
  });

  it('rejects relative paths', () => {
    expect(safeNext('account')).toBe('/account');
    expect(safeNext('evil.example/path')).toBe('/account');
  });
});
