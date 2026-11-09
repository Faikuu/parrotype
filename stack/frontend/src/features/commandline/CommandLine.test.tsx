import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { useUi } from '@/store/ui';
import { CommandLine } from './CommandLine';

function renderPalette(extra?: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {extra}
        <CommandLine />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Logged out: /auth/me returns 401.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })),
  );
  useUi.setState({ commandLineOpen: false, commandLineInitialPath: undefined, customTextOpen: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('command line focus', () => {
  it('returns focus to the element that had it before the palette opened', async () => {
    const user = userEvent.setup();
    renderPalette(<button type="button">Outside</button>);
    const button = screen.getByRole('button', { name: 'Outside' });

    act(() => button.focus());
    act(() => useUi.getState().openCommandLine());
    expect(screen.getByRole('combobox')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(useUi.getState().commandLineOpen).toBe(false);
    expect(button).toHaveFocus();
  });

  it('focuses the typing input when nothing useful had focus', async () => {
    const user = userEvent.setup();
    renderPalette(<input data-typing-input aria-label="typing" />);
    const typing = screen.getByRole('textbox', { name: 'typing' });

    act(() => useUi.getState().openCommandLine());
    await user.keyboard('{Escape}');
    expect(typing).toHaveFocus();
  });
});
