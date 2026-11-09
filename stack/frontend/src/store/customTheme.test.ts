import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, useSettings } from './settings';
import { getTheme } from '@/themes/themes';

const TOKENS = getTheme('macaw').tokens;

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS });
});

describe('custom theme settings', () => {
  it('keeps a valid custom theme and lowercases its hex values', () => {
    const out = sanitizeSettings({ theme: 'custom', customTheme: { ...TOKENS, bg: '#0F1F3A' } });
    expect(out.customTheme).toEqual({ ...TOKENS, bg: '#0f1f3a' });
    expect(out.theme).toBe('custom');
  });

  it('drops a custom theme with a bad field and falls back to the default theme', () => {
    const out = sanitizeSettings({ theme: 'custom', customTheme: { ...TOKENS, caret: 'orange' } });
    expect(out.customTheme).toBeNull();
    expect(out.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('drops a custom theme that is missing a field', () => {
    const { errorExtra: _omit, ...partial } = TOKENS;
    expect(sanitizeSettings({ customTheme: partial }).customTheme).toBeNull();
  });

  it('keeps the built-in choice when there is no custom theme', () => {
    const out = sanitizeSettings({ theme: 'budgie', customTheme: null });
    expect(out.theme).toBe('budgie');
    expect(out.customTheme).toBeNull();
  });

  it('rejects an unknown theme id', () => {
    expect(sanitizeSettings({ theme: 'parrot', customTheme: TOKENS }).theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('keeps a custom theme across a reload (the persisted value goes through sanitize)', () => {
    const persisted = sanitizeSettings({ theme: 'custom', customTheme: TOKENS });
    useSettings.setState({ ...DEFAULT_SETTINGS });
    useSettings.setState(persisted);
    expect(useSettings.getState().theme).toBe('custom');
    expect(useSettings.getState().customTheme).toEqual(TOKENS);
  });
});

describe('modifier settings', () => {
  it('keeps booleans for noBackspace and suddenDeath', () => {
    const out = sanitizeSettings({ noBackspace: true, suddenDeath: true });
    expect(out.noBackspace).toBe(true);
    expect(out.suddenDeath).toBe(true);
  });

  it('drops non-boolean values back to false', () => {
    const out = sanitizeSettings({ noBackspace: 'yes', suddenDeath: 1 });
    expect(out.noBackspace).toBe(false);
    expect(out.suddenDeath).toBe(false);
  });

  it('are part of the test config', () => {
    useSettings.getState().setMany({ noBackspace: true, suddenDeath: true });
    const { selectTestConfig } = useSettingsModule();
    const cfg = selectTestConfig(useSettings.getState());
    expect(cfg.noBackspace).toBe(true);
    expect(cfg.suddenDeath).toBe(true);
  });
});

function useSettingsModule() {
  return { selectTestConfig: requireSelect() };
}

// Imported lazily so the test reads as one module above; the function is a plain export.
import { selectTestConfig as requireSelect } from './settings';
