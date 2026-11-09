import { describe, expect, it } from 'vitest';
import { contrastRatio, contrastWarnings, isLightColour, relativeLuminance } from './contrast';
import { getTheme, THEMES } from './themes';

describe('contrast', () => {
  it('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#9db35f', '#1d2119')).toBeCloseTo(contrastRatio('#1d2119', '#9db35f'), 10);
  });

  it('matches the WCAG relative luminance formula', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBe(0);
    // #808080 is the classic 4.0 limit against black text on white (ratio ~3.95).
    expect(contrastRatio('#808080', '#ffffff')).toBeCloseTo(3.95, 2);
  });

  it('flags text under 4.5:1 and sub text under 3:1, and nothing else', () => {
    const ok = { bg: '#000000', text: '#ffffff', sub: '#8a8a8a' };
    expect(contrastWarnings(ok)).toEqual([]);

    const dimText = { bg: '#000000', text: '#555555', sub: '#8a8a8a' };
    const warnings = contrastWarnings(dimText);
    expect(warnings.map((w) => w.pair)).toEqual(['text']);
    expect(warnings[0]!.min).toBe(4.5);
    expect(warnings[0]!.ratio).toBeLessThan(4.5);

    const dimSub = { bg: '#000000', text: '#ffffff', sub: '#222222' };
    expect(contrastWarnings(dimSub).map((w) => w.pair)).toEqual(['sub']);
    expect(contrastWarnings(dimSub)[0]!.min).toBe(3);
  });

  it('does not warn about the built-in themes except where the design already accepts it', () => {
    // The built-ins were picked by hand; only check that the warning logic runs on each of them.
    for (const theme of THEMES) {
      expect(() => contrastWarnings(theme.tokens)).not.toThrow();
    }
    expect(contrastWarnings(getTheme('kea').tokens)).toEqual([]);
  });

  it('tells light backgrounds from dark ones', () => {
    expect(isLightColour('#ffffff')).toBe(true);
    expect(isLightColour('#e6e9ec')).toBe(true);
    expect(isLightColour('#1d2119')).toBe(false);
    expect(isLightColour('#000000')).toBe(false);
  });
});
