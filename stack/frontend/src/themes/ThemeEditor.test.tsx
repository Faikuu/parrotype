import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useApplySettings } from '@/store/useApplySettings';
import { useUi } from '@/store/ui';
import { ThemeEditor } from './ThemeEditor';
import { encodeThemeCode } from './themeCode';
import { getTheme } from './themes';

function Harness() {
  useApplySettings();
  return <ThemeEditor />;
}

const KEA = getTheme('kea').tokens;
const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function openEditor() {
  act(() => useUi.setState({ themeEditorOpen: true }));
  return render(<Harness />);
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS, theme: 'kea', customTheme: null });
  useUi.setState({ themeEditorOpen: false, themeDraft: null, commandLineOpen: false, customTextOpen: false });
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  // The active theme is applied the way main.tsx does before the first render.
  document.documentElement.style.setProperty('--bg', KEA.bg);
  document.documentElement.style.setProperty('--text', KEA.text);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('ThemeEditor', () => {
  it('has eight labelled colour inputs prefilled from the active theme', () => {
    openEditor();
    const labels = ['Background', 'Surface', 'Text', 'Secondary text', 'Accent', 'Caret', 'Error', 'Extra characters'];
    for (const label of labels) {
      expect(field(label)).toHaveAttribute('type', 'color');
    }
    expect(field('Background')).toHaveValue(KEA.bg);
    expect(field('Accent')).toHaveValue(KEA.main);
  });

  it('live-previews an edit on the page, and reverts when cancelled', () => {
    openEditor();
    fireEvent.change(field('Background'), { target: { value: '#112233' } });
    expect(useUi.getState().themeDraft?.bg).toBe('#112233');
    expect(cssVar('--bg')).toBe('#112233');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useUi.getState().themeEditorOpen).toBe(false);
    expect(useUi.getState().themeDraft).toBeNull();
    expect(cssVar('--bg')).toBe(KEA.bg);
    expect(useSettings.getState().customTheme).toBeNull();
    expect(useSettings.getState().theme).toBe('kea');
  });

  it('closes and reverts on Escape', () => {
    openEditor();
    fireEvent.change(field('Background'), { target: { value: '#112233' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(useUi.getState().themeEditorOpen).toBe(false);
    expect(cssVar('--bg')).toBe(KEA.bg);
  });

  it('saves the custom theme and selects it', () => {
    openEditor();
    fireEvent.change(field('Background'), { target: { value: '#112233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));

    expect(useUi.getState().themeEditorOpen).toBe(false);
    expect(useSettings.getState().theme).toBe('custom');
    expect(useSettings.getState().customTheme?.bg).toBe('#112233');
    expect(useSettings.getState().customTheme?.text).toBe(KEA.text);
    expect(cssVar('--bg')).toBe('#112233');
  });

  it('exports a pt1 code to the clipboard and confirms it', async () => {
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
    const code = encodeThemeCode(KEA);
    expect(writeText).toHaveBeenCalledWith(code);
    expect(screen.getByRole('textbox', { name: 'Theme code' })).toHaveValue(code);
  });

  it('imports a valid code into the editor', () => {
    openEditor();
    const macaw = getTheme('macaw').tokens;
    fireEvent.change(screen.getByLabelText('Paste a theme code'), { target: { value: encodeThemeCode(macaw) } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(screen.queryByText("That code isn't a valid theme")).toBeNull();
    expect(field('Background')).toHaveValue(macaw.bg);
    expect(useUi.getState().themeDraft).toEqual(macaw);
    expect(screen.getByText('Imported. Save the theme to keep it.')).toBeInTheDocument();
  });

  it.each([
    ['not a code', 'hello'],
    ['wrong prefix', 'pt2.abc'],
    ['bad JSON', 'pt1.bm90IGpzb24'],
  ])('shows an error for %s', (_label, value) => {
    openEditor();
    fireEvent.change(screen.getByLabelText('Paste a theme code'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('alert')).toHaveTextContent("That code isn't a valid theme");
    expect(field('Background')).toHaveValue(KEA.bg);
  });

  it('warns when the text or secondary text is hard to read on the background', () => {
    openEditor();
    fireEvent.change(field('Text'), { target: { value: '#2a2a2a' } });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/Text on the background is \d+\.\d:1\. Aim for at least 4\.5:1\./);
  });

  it('shows no warning for the built-in Kea theme', () => {
    openEditor();
    expect(screen.queryByText(/Aim for at least/)).toBeNull();
  });
});
