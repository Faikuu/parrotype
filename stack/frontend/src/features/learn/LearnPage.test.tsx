import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import '@/i18n';
import { LESSONS_STORAGE_KEY } from './progress';
import LearnPage from './LearnPage';

// The real typing area needs real keystrokes. These tests only need its result, so it is replaced by a
// stub that reports a fixed result when the test presses its button.
let nextResult = { wpm: 30, accuracy: 99 };
vi.mock('@/features/race/TypingArea', async () => {
  const { createElement } = await import('react');
  return {
    TypingArea: (props: {
      onFinish: (r: { chars: number; wpm: number; accuracy: number; durationMs: number }) => void;
    }) =>
      createElement(
        'button',
        {
          type: 'button',
          onClick: () => props.onFinish({ chars: 10, durationMs: 9000, ...nextResult }),
        },
        'Finish lesson',
      ),
  };
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.search}</p>;
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/learn"
            element={
              <>
                <LearnPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  nextResult = { wpm: 30, accuracy: 99 };
});

describe('Learn page', () => {
  it('locks every lesson after the first until it is passed', () => {
    renderAt('/learn');
    const list = screen.getByRole('list', { name: 'Lessons' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(14);

    const second = items[1]!;
    expect(within(second).getByRole('button')).toBeDisabled();
    expect(within(second).getByText('Pass lesson 1 first')).toBeInTheDocument();

    expect(within(items[0]!).getByRole('button', { name: /Home row: f and j/ })).toBeEnabled();
    expect(within(items[0]!).getByText('Not passed yet')).toBeInTheDocument();
  });

  it('unlocks the next lesson after a passing result', async () => {
    const user = userEvent.setup();
    renderAt('/learn');

    await user.click(screen.getByRole('button', { name: /Home row: f and j/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Home row: f and j' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finish lesson' }));
    expect(screen.getByText(/^Passed\. 30 wpm at 99% accuracy\.$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next lesson' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Home row: d and k' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('?lesson=home-dk');

    // The progress is saved, so the list shows lesson 1 as passed and lesson 2 as open.
    const stored = JSON.parse(localStorage.getItem(LESSONS_STORAGE_KEY) ?? '{}') as Record<string, { passed: boolean }>;
    expect(stored['home-fj']?.passed).toBe(true);
    await user.click(screen.getByRole('button', { name: 'All lessons' }));
    const items = within(screen.getByRole('list', { name: 'Lessons' })).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Passed')).toBeInTheDocument();
    expect(within(items[1]!).getByRole('button')).toBeEnabled();
    expect(within(items[2]!).getByRole('button')).toBeDisabled();
  });

  it('keeps the lesson locked for a failing result and offers a retry', async () => {
    nextResult = { wpm: 4, accuracy: 60 };
    const user = userEvent.setup();
    renderAt('/learn?lesson=home-fj');

    await user.click(screen.getByRole('button', { name: 'Finish lesson' }));
    expect(screen.getByText(/^Not yet\. 4 wpm/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next lesson' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All lessons' }));
    const items = within(screen.getByRole('list', { name: 'Lessons' })).getAllByRole('listitem');
    expect(within(items[1]!).getByRole('button')).toBeDisabled();
  });

  it('shows saved progress from an earlier visit', () => {
    localStorage.setItem(
      LESSONS_STORAGE_KEY,
      JSON.stringify({ 'home-fj': { passed: true, bestWpm: 31, bestAcc: 98 } }),
    );
    renderAt('/learn');
    const items = within(screen.getByRole('list', { name: 'Lessons' })).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Passed')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Best 31 wpm, 98% accuracy')).toBeInTheDocument();
    expect(within(items[1]!).getByRole('button')).toBeEnabled();
  });

  it('ignores corrupt saved progress and starts from lesson 1', () => {
    localStorage.setItem(LESSONS_STORAGE_KEY, 'not json');
    renderAt('/learn');
    const items = within(screen.getByRole('list', { name: 'Lessons' })).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Not passed yet')).toBeInTheDocument();
    expect(within(items[1]!).getByRole('button')).toBeDisabled();
  });
});
