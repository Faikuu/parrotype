import { DEFAULT_SETTINGS, sanitizeSettings, SETTINGS_VERSION, useSettings } from './settings';

describe('sanitizeSettings: 2.1 keys', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      paceCaret: 'off',
      paceWpm: 60,
      tapeMode: false,
      sound: 'off',
      soundVolume: 0.5,
    });
    expect(SETTINGS_VERSION).toBe(2);
  });

  it('clamps paceWpm to 10–300', () => {
    expect(sanitizeSettings({ paceWpm: 5 }).paceWpm).toBe(10);
    expect(sanitizeSettings({ paceWpm: 999 }).paceWpm).toBe(300);
    expect(sanitizeSettings({ paceWpm: 80 }).paceWpm).toBe(80);
  });

  it('ignores a non-finite paceWpm and keeps the default', () => {
    expect(sanitizeSettings({ paceWpm: Number.NaN }).paceWpm).toBe(DEFAULT_SETTINGS.paceWpm);
    expect(sanitizeSettings({ paceWpm: Number.POSITIVE_INFINITY }).paceWpm).toBe(DEFAULT_SETTINGS.paceWpm);
  });

  it('clamps soundVolume to 0–1', () => {
    expect(sanitizeSettings({ soundVolume: -2 }).soundVolume).toBe(0);
    expect(sanitizeSettings({ soundVolume: 4 }).soundVolume).toBe(1);
    expect(sanitizeSettings({ soundVolume: 0.25 }).soundVolume).toBe(0.25);
  });

  it('only accepts the known pace caret and sound profiles', () => {
    expect(sanitizeSettings({ paceCaret: 'pb' }).paceCaret).toBe('pb');
    expect(sanitizeSettings({ paceCaret: 'fast' }).paceCaret).toBe('off');
    expect(sanitizeSettings({ sound: 'typewriter' }).sound).toBe('typewriter');
    expect(sanitizeSettings({ sound: 'drum' }).sound).toBe('off');
  });

  it('keeps tapeMode as a boolean and rejects other types', () => {
    expect(sanitizeSettings({ tapeMode: true }).tapeMode).toBe(true);
    expect(sanitizeSettings({ tapeMode: 'yes' }).tapeMode).toBe(false);
  });

  it('accepts all four languages', () => {
    for (const language of ['en', 'pl', 'de', 'es']) {
      expect(sanitizeSettings({ language }).language).toBe(language);
    }
    expect(sanitizeSettings({ language: 'fr' }).language).toBe('en');
  });

  it('accepts the daily and weak modes', () => {
    expect(sanitizeSettings({ mode: 'daily' }).mode).toBe('daily');
    expect(sanitizeSettings({ mode: 'weak' }).mode).toBe('weak');
    expect(sanitizeSettings({ mode: 'hard' }).mode).toBe('time');
  });

  it('migrates a version 1 object: the old values are kept and the new keys get defaults', () => {
    const v1 = {
      mode: 'words',
      words: 50,
      language: 'pl',
      theme: 'macaw',
      caretStyle: 'block',
      fontSize: 1.5,
      customText: 'ząb łąka',
    };
    const migrated = sanitizeSettings(v1);
    expect(migrated).toMatchObject({ ...v1, paceCaret: 'off', paceWpm: 60, tapeMode: false, sound: 'off', soundVolume: 0.5 });
  });

  it('returns defaults for non-object input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('is wired into the persisted store', () => {
    expect(useSettings.persist.getOptions().version).toBe(SETTINGS_VERSION);
    expect(useSettings.persist.getOptions().migrate?.({ words: 10 }, 1)).toMatchObject({ words: 10, paceCaret: 'off' });
  });
});
