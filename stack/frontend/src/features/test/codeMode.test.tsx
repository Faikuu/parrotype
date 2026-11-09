import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { createInitialState, engineReducer } from '@/lib/engine/engine';
import { ghostPosition } from '@/lib/engine/ghost';
import { CODE_SNIPPETS, codeToWords } from '@/lib/text/code';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { ReplayPlayer } from './ReplayPlayer';
import TestPage from './TestPage';

/** user-event reads `{` and `[` as key-name syntax, so they are doubled to be typed literally. */
const literal = (text: string) => text.replace(/[[{]/g, (m) => m + m);

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

/** The first JavaScript snippet (Math.random is pinned to 0 in these tests, so it is always this one). */
const snippet = CODE_SNIPPETS.js[0]!;
const lines = codeToWords(snippet.code);
const firstLineEnd = lines.breaks.indexOf(true);

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Unauthorized' })));
  useSettings.setState({ ...DEFAULT_SETTINGS, mode: 'code', codeLanguage: 'js', focusMode: false, smoothCaret: false, tapeMode: false });
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('code mode: rendering', () => {
  it('shows every line break as a faint ↵, the indentation, and the snippet title', () => {
    renderPage();

    const breaks = lines.breaks.filter(Boolean).length;
    expect(document.querySelectorAll('.code-eol')).toHaveLength(breaks);
    expect(document.querySelectorAll('.code-break')).toHaveLength(breaks);
    expect(document.querySelectorAll('.word')).toHaveLength(lines.words.length);

    // The second line of FizzBuzz is indented by two spaces; its first word carries that as a margin.
    const indented = lines.indent.indexOf(2);
    expect(document.querySelector<HTMLElement>(`[data-word="${indented}"]`)?.style.marginInlineStart).toBe('2ch');
    expect(document.querySelector<HTMLElement>(`[data-word="${firstLineEnd}"] .code-eol`)).not.toBeNull();

    expect(screen.getByText(`— ${snippet.title}`)).toBeInTheDocument();
  });

  it('turns the ↵ into text colour once its line is passed', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('textbox', { name: 'Typing input' }));
    const eol = () => document.querySelector<HTMLElement>(`[data-word="${firstLineEnd}"] .code-eol`);
    expect(eol()?.className).toContain('text-sub');

    await user.keyboard(literal(lines.words.slice(0, firstLineEnd + 1).join(' ')));
    await user.keyboard('{Enter}');
    expect(eol()?.className).toContain('text-text');
  });

  it('does not use tape mode, even when it is on', () => {
    useSettings.setState({ tapeMode: true });
    renderPage();
    expect(document.querySelector('.test-viewport')?.hasAttribute('data-tape')).toBe(false);
  });
});

describe('code mode: line breaks', () => {
  it('space at a line end does nothing, and Enter moves on to the next line', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('textbox', { name: 'Typing input' }));

    // Type the whole first line, then press space where the line ends.
    for (let i = 0; i < firstLineEnd; i++) await user.keyboard(`${literal(lines.words[i]!)} `);
    await user.keyboard(literal(lines.words[firstLineEnd]!));
    await user.keyboard(' ');
    // The ↵ after the word is part of its text, so it is taken out for the comparison.
    expect(document.querySelector(`[data-word="${firstLineEnd}"]`)?.textContent?.replace('↵', '')).toBe(
      lines.words[firstLineEnd],
    );
    expect(document.querySelector('.text-error-extra')).toBeNull();

    // Enter is the separator there. The next key lands on the first word of the next line.
    await user.keyboard('{Enter}');
    const next = firstLineEnd + 1;
    await user.keyboard(literal(lines.words[next]!.charAt(0)));
    const firstLetter = document.querySelector<HTMLElement>(`[data-word="${next}"] [data-c="0"]`);
    expect(firstLetter?.className).toContain('text-text');
    expect(document.querySelector('.word-error')).toBeNull();
  });
});

describe('code mode: replay and ghost', () => {
  it('replays a finished code run with its line breaks, and the ghost stops at the end of the run', () => {
    const config = { ...DEFAULT_SETTINGS, mode: 'code' as const, codeLanguage: 'js' as const, customText: '' };
    const code = { breaks: lines.breaks, indent: lines.indent };
    // Type the first line and its line break, one event every 10ms.
    let state = createInitialState(config, lines.words, { code });
    let at = 1000;
    for (let i = 0; i <= firstLineEnd; i++) {
      for (const ch of lines.words[i]!) state = engineReducer(state, { type: 'char', char: ch, at: (at += 10) });
      state = engineReducer(state, i === firstLineEnd ? { type: 'newline', at: (at += 10) } : { type: 'space', at: (at += 10) });
    }
    expect(state.current).toBe(firstLineEnd + 1);

    render(<ReplayPlayer config={config} words={lines.words} events={state.events} final={state} code={code} />);
    expect(document.querySelectorAll('.code-eol').length).toBe(lines.breaks.filter(Boolean).length);

    // The ghost is on the first word of the next line once the break has been replayed.
    const end = state.events[state.events.length - 1]!.t;
    expect(ghostPosition(config, lines.words, state.events, end, code)).toEqual({ word: firstLineEnd + 1, char: 0 });
  });
});
