import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { DAILY_GHOST_KEY } from '@/store/dailyGhost';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { utcDateString } from '@/lib/text/daily';
import TestPage from './TestPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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

/** Letter spans of one word: their classes, in order. */
function letterClasses(index: number): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-w="${index}"]`)).map((el) => el.className);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Unauthorized' })));
  useSettings.setState({
    ...DEFAULT_SETTINGS,
    mode: 'custom',
    customText: 'oat cat',
    focusMode: false,
    smoothCaret: false,
    tapeMode: false,
    layout: 'qwerty',
    ghost: true,
  });
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('keyboard layout emulation', () => {
  it('under Dvorak, the physical keys S, A and K type "oat"', async () => {
    useSettings.setState({ layout: 'dvorak' });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('textbox', { name: 'Typing input' }));

    await user.keyboard('sak');
    expect(document.querySelector('[data-word="0"]')?.textContent).toBe('oat');
    expect(letterClasses(0).every((c) => c.includes('text-text'))).toBe(true);
    expect(document.querySelector('.word-error')).toBeNull();

    await user.keyboard(' ');
    expect(document.querySelector('[data-word="1"]')).not.toBeNull();
  });

  it('under QWERTY, the keys type themselves', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('textbox', { name: 'Typing input' }));
    await user.keyboard('oat');
    expect(letterClasses(0).every((c) => c.includes('text-text'))).toBe(true);
  });
});

describe('ghost races', () => {
  beforeEach(() => {
    useSettings.setState({ mode: 'custom', customText: 'ab cd' });
  });

  it('"Race your ghost" restarts with the same words and draws the ghost caret', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('textbox', { name: 'Typing input' }));
    await user.keyboard('ab cd');

    expect(document.querySelector('.test-caret')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Race your ghost' }));

    const ghost = document.querySelector<HTMLElement>('.test-ghost-caret');
    expect(ghost).not.toBeNull();
    expect(ghost!.style.display).not.toBe('none');
    expect(document.querySelector('[data-word="0"]')?.textContent).toBe('ab');
  });

  it('the ghost button is hidden when ghosts are turned off', async () => {
    const user = userEvent.setup();
    useSettings.setState({ ghost: false });
    renderPage();
    await user.click(screen.getByRole('textbox', { name: 'Typing input' }));
    await user.keyboard('ab cd');
    expect(screen.queryByRole('button', { name: 'Race your ghost' })).toBeNull();
  });

  it('daily mode races the first attempt of the day automatically', () => {
    const date = utcDateString();
    window.localStorage.setItem(
      DAILY_GHOST_KEY,
      JSON.stringify({ [`${date}|en`]: { words: ['daily'], events: [{ t: 0, k: 'c', ch: 'd' }] } }),
    );
    useSettings.setState({ mode: 'daily', language: 'en' });
    renderPage();
    const ghost = document.querySelector<HTMLElement>('.test-ghost-caret');
    expect(ghost?.style.display).not.toBe('none');
  });

  it('the daily ghost is off when ghosts are off', () => {
    const date = utcDateString();
    window.localStorage.setItem(
      DAILY_GHOST_KEY,
      JSON.stringify({ [`${date}|en`]: { words: ['daily'], events: [{ t: 0, k: 'c', ch: 'd' }] } }),
    );
    useSettings.setState({ mode: 'daily', language: 'en', ghost: false });
    renderPage();
    expect(document.querySelector('.test-ghost-caret')).toBeNull();
  });
});
