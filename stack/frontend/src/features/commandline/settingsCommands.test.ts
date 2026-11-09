import { describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { DEFAULT_SETTINGS, useSettings, type Settings } from '@/store/settings';
import { buildCommands, resolveLevel, type CommandContext } from './commands';

function ctxFor(settings: Partial<Settings> = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings } as Settings;
  const set = vi.fn();
  const ctx: CommandContext = {
    t: (key, options) => String(i18n.t(key, options)),
    settings: { ...s, set, setMany: vi.fn(), reset: vi.fn() },
    isLoggedIn: false,
    navigate: vi.fn(),
    logout: vi.fn(),
    restart: vi.fn(),
    openCustomText: vi.fn(),
    openThemeEditor: vi.fn(),
    previewTheme: vi.fn(),
  };
  return { ctx, set };
}

describe('settings commands for the new settings', () => {
  it('toggles one funbox at a time, keeping the others in their fixed order', () => {
    const { ctx, set } = ctxFor({ funbox: ['caps'] });
    const children = resolveLevel(buildCommands(ctx), ['funbox']).list;
    const mirror = children.find((c) => c.id === 'funbox.mirror');
    mirror?.run?.();
    expect(set).toHaveBeenLastCalledWith('funbox', ['mirror', 'caps']);

    const caps = children.find((c) => c.id === 'funbox.caps');
    expect(caps?.active).toBe(true);
    caps?.run?.();
    expect(set).toHaveBeenLastCalledWith('funbox', []);
  });

  it('offers no funbox, and shows the active ones in the hint', () => {
    const { ctx } = ctxFor({ funbox: ['memory'] });
    const root = buildCommands(ctx);
    expect(root.find((c) => c.id === 'funbox')?.hint).toBe('Memory');
    const off = resolveLevel(root, ['funbox']).list.find((c) => c.id === 'funbox.off');
    expect(off?.active).toBe(false);
    off?.run?.();
  });

  it('sets the keyboard hints, the on-screen keyboard, the interface font and the interface size', () => {
    const { ctx, set } = ctxFor();
    const root = buildCommands(ctx);
    const hints = resolveLevel(root, ['keyboardHints']).list;
    expect(hints.map((c) => c.id)).toEqual(['keyboardHints.off', 'keyboardHints.next', 'keyboardHints.fingers']);
    hints.find((c) => c.id === 'keyboardHints.fingers')?.run?.();
    expect(set).toHaveBeenLastCalledWith('keyboardHints', 'fingers');

    const keyboard = root.find((c) => c.id === 'showKeyboard');
    expect(keyboard?.hint).toBe('Off');
    keyboard?.run?.();
    expect(set).toHaveBeenLastCalledWith('showKeyboard', true);

    resolveLevel(root, ['uiFont']).list.find((c) => c.id === 'uiFont.dyslexic')?.run?.();
    expect(set).toHaveBeenLastCalledWith('uiFont', 'dyslexic');

    const scales = resolveLevel(root, ['uiScale']).list;
    expect(scales.map((c) => c.label)).toEqual(['90%', '100%', '110%', '125%']);
    scales.find((c) => c.id === 'uiScale.1.25')?.run?.();
    expect(set).toHaveBeenLastCalledWith('uiScale', 1.25);
  });

  it('offers the high-contrast theme and the OpenDyslexic font in their menus', () => {
    const { ctx } = ctxFor();
    const root = buildCommands(ctx);
    expect(resolveLevel(root, ['theme']).list.map((c) => c.id)).toContain('theme.high-contrast');
    expect(resolveLevel(root, ['font']).list.map((c) => c.id)).toContain('font.opendyslexic');
  });

  it('keeps the store defaults for the new settings', () => {
    useSettings.getState().reset();
    const s = useSettings.getState();
    expect({ funbox: s.funbox, keyboardHints: s.keyboardHints, showKeyboard: s.showKeyboard, uiFont: s.uiFont, uiScale: s.uiScale }).toEqual({
      funbox: [],
      keyboardHints: 'next',
      showKeyboard: false,
      uiFont: 'default',
      uiScale: 1,
    });
  });
});
