import { describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { DEFAULT_SETTINGS, useSettings, type Settings } from '@/store/settings';
import { getTheme } from '@/themes/themes';
import { buildCommands, resolveLevel, type CommandContext } from './commands';

function ctxFor(settings: Partial<Settings> = {}): CommandContext {
  const s = { ...DEFAULT_SETTINGS, ...settings } as Settings;
  return {
    t: (key, options) => String(i18n.t(key, options)),
    settings: { ...s, set: vi.fn(), setMany: vi.fn(), reset: vi.fn() },
    isLoggedIn: false,
    navigate: vi.fn(),
    logout: vi.fn(),
    restart: vi.fn(),
    openCustomText: vi.fn(),
    openThemeEditor: vi.fn(),
    previewTheme: vi.fn(),
  };
}

function themeChildren(ctx: CommandContext) {
  const root = buildCommands(ctx);
  return resolveLevel(root, ['theme']).list.map((c) => c.id);
}

describe('theme commands', () => {
  it('offers Customise theme under Theme, with no Custom entry until a custom theme exists', () => {
    const ids = themeChildren(ctxFor());
    expect(ids).toContain('theme.customise');
    expect(ids).not.toContain('theme.custom');
  });

  it('adds a Custom entry once a custom theme is saved', () => {
    const ids = themeChildren(ctxFor({ customTheme: getTheme('macaw').tokens }));
    expect(ids).toContain('theme.custom');
    expect(ids.indexOf('theme.custom')).toBeLessThan(ids.indexOf('theme.customise'));
  });

  it('Customise theme opens the editor', () => {
    const ctx = ctxFor();
    const cmd = resolveLevel(buildCommands(ctx), ['theme']).list.find((c) => c.id === 'theme.customise');
    cmd?.run?.();
    expect(ctx.openThemeEditor).toHaveBeenCalledTimes(1);
  });

  it('the Custom entry previews and selects the custom theme', () => {
    const ctx = ctxFor({ customTheme: getTheme('macaw').tokens, theme: 'custom' });
    const entry = resolveLevel(buildCommands(ctx), ['theme']).list.find((c) => c.id === 'theme.custom');
    expect(entry?.active).toBe(true);
    entry?.onPreview?.();
    expect(ctx.previewTheme).toHaveBeenCalledWith('custom');
    entry?.run?.();
    expect(ctx.settings.set).toHaveBeenCalledWith('theme', 'custom');
  });
});

describe('modifier commands', () => {
  it('has no backspace and sudden death toggles in Behaviour', () => {
    const root = buildCommands(ctxFor());
    const noBackspace = root.find((c) => c.id === 'noBackspace');
    const suddenDeath = root.find((c) => c.id === 'suddenDeath');
    expect(noBackspace?.group).toBe(i18n.t('commands:groups.behaviour'));
    expect(suddenDeath?.group).toBe(i18n.t('commands:groups.behaviour'));
    expect(noBackspace?.keepOpen).toBe(true);
  });

  it('toggles the setting', () => {
    const ctx = ctxFor({ suddenDeath: false });
    const cmd = buildCommands(ctx).find((c) => c.id === 'suddenDeath');
    cmd?.run?.();
    expect(ctx.settings.set).toHaveBeenCalledWith('suddenDeath', true);
  });
});

describe('store defaults', () => {
  it('starts with the modifiers off and no custom theme', () => {
    useSettings.getState().reset();
    expect(useSettings.getState().noBackspace).toBe(false);
    expect(useSettings.getState().suddenDeath).toBe(false);
    expect(useSettings.getState().customTheme).toBeNull();
  });
});
