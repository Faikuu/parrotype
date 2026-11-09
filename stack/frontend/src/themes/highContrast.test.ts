import { act, renderHook } from '@testing-library/react';
import { contrastRatio } from './contrast';
import { applyUiFont, applyUiScale, FONTS, FONT_IDS, getTheme, THEME_IDS } from './themes';
import { useApplySettings } from '@/store/useApplySettings';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';

describe('high-contrast theme', () => {
  const { tokens } = getTheme('high-contrast');

  it('is a built-in theme with pure black and white and a yellow accent', () => {
    expect(THEME_IDS).toContain('high-contrast');
    expect(tokens.bg).toBe('#000000');
    expect(tokens.text).toBe('#ffffff');
    expect(tokens.main).toBe('#ffe000');
  });

  it('meets 7:1 for the text and 4.5:1 for the sub text on the background', () => {
    expect(contrastRatio(tokens.text, tokens.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(tokens.sub, tokens.bg)).toBeGreaterThanOrEqual(4.5);
    // The surface (raised areas) keeps the text readable too.
    expect(contrastRatio(tokens.text, tokens.surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(tokens.main, tokens.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(tokens.error, tokens.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('has the OpenDyslexic font for the test text, and a UI font choice of default or dyslexic', () => {
    expect(FONT_IDS).toContain('opendyslexic');
    expect(FONTS.opendyslexic.family).toContain('OpenDyslexic');
    applyUiFont('dyslexic');
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('OpenDyslexic');
    applyUiFont('default');
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Familjen Grotesk');
  });
});

describe('uiScale', () => {
  it('sets the root scale variable from the setting, which the root font size follows', () => {
    useSettings.setState({ ...DEFAULT_SETTINGS, uiScale: 1.25, theme: 'kea', uiFont: 'default' });
    renderHook(() => useApplySettings());
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.25');

    act(() => useSettings.setState({ uiScale: 0.9 }));
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.9');
    applyUiScale(1);
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1');
  });
});
