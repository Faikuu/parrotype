import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { HC_DISMISS_KEY } from './highContrastPrompt';
import { HighContrastSuggestion } from './HighContrastSuggestion';

function prefersMoreContrast(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matches && query === '(prefers-contrast: more)', media: query, addEventListener() {}, removeEventListener() {} })),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useSettings.setState({ ...DEFAULT_SETTINGS, theme: 'kea' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HighContrastSuggestion', () => {
  it('suggests the high-contrast theme once when the system asks for more contrast', async () => {
    prefersMoreContrast(true);
    const user = userEvent.setup();
    render(<HighContrastSuggestion />);
    expect(screen.getByRole('heading', { name: 'Try high contrast?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use high contrast' }));
    expect(useSettings.getState().theme).toBe('high-contrast');
    expect(screen.queryByRole('heading', { name: 'Try high contrast?' })).toBeNull();
    expect(window.localStorage.getItem(HC_DISMISS_KEY)).toBe('1');
  });

  it('stays hidden when the system does not ask, or after it was dismissed', async () => {
    prefersMoreContrast(false);
    const first = render(<HighContrastSuggestion />);
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    prefersMoreContrast(true);
    window.localStorage.setItem(HC_DISMISS_KEY, '1');
    const second = render(<HighContrastSuggestion />);
    expect(second.container).toBeEmptyDOMElement();
  });

  it('can be dismissed, and the dismissal is remembered', async () => {
    prefersMoreContrast(true);
    const user = userEvent.setup();
    const { unmount } = render(<HighContrastSuggestion />);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('heading', { name: 'Try high contrast?' })).toBeNull();
    unmount();

    const again = render(<HighContrastSuggestion />);
    expect(again.container).toBeEmptyDOMElement();
  });

  it('does not suggest it while the high-contrast theme is already on', () => {
    prefersMoreContrast(true);
    useSettings.setState({ theme: 'high-contrast' });
    const { container } = render(<HighContrastSuggestion />);
    expect(container).toBeEmptyDOMElement();
  });
});
