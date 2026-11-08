import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import TestPage from './TestPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TestPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Logged out: /auth/me returns 401.
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Unauthorized' })));
  useSettings.setState({
    ...DEFAULT_SETTINGS,
    mode: 'words',
    words: 10,
    punctuation: false,
    numbers: false,
    language: 'en',
    focusMode: false,
    smoothCaret: false,
    caretStyle: 'line',
  });
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TestPage', () => {
  it('colours correct and wrong letters as the user types', async () => {
    const user = userEvent.setup();
    renderPage();

    const word0 = Array.from(document.querySelectorAll<HTMLElement>('.word')).find(
      (w) => (w.textContent ?? '').length >= 3,
    );
    expect(word0).toBeDefined();
    const target = word0!.textContent ?? '';

    const input = screen.getByRole('textbox', { name: 'Typing input' });
    await user.click(input);

    const wrong = target.charAt(2) === 'z' ? 'q' : 'z';
    await user.keyboard(target.slice(0, 2) + wrong);

    const letters = word0!.querySelectorAll('span');
    expect(letters[0]!.className).toContain('text-text');
    expect(letters[1]!.className).toContain('text-text');
    expect(letters[2]!.className).toContain('text-error');
    expect(document.querySelector('.test-caret')).not.toBeNull();
  });

  it('shows the focus hint when the input is not focused', () => {
    renderPage();
    const input = screen.getByRole('textbox', { name: 'Typing input' });
    act(() => input.blur());
    expect(screen.getByText('Click or start typing to focus')).toBeInTheDocument();
  });

  it('hides the focus hint while the command line or custom text dialog is open', () => {
    renderPage();
    const input = screen.getByRole('textbox', { name: 'Typing input' });
    act(() => input.blur());
    expect(screen.getByText('Click or start typing to focus')).toBeInTheDocument();

    act(() => useUi.setState({ commandLineOpen: true }));
    expect(screen.queryByText('Click or start typing to focus')).toBeNull();

    act(() => useUi.setState({ commandLineOpen: false, customTextOpen: true }));
    expect(screen.queryByText('Click or start typing to focus')).toBeNull();
  });
});
