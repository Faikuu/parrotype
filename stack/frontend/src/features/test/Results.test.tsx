import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { createInitialState, engineReducer } from '@/lib/engine/engine';
import { computeResult } from '@/lib/engine/stats';
import type { EngineState } from '@/lib/engine/types';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { Results } from './Results';
import { customConfig, runTyping } from './fixtures';
import type { FinishedResult, SaveState } from './useTypingTest';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function renderResults(state: EngineState, saveState: SaveState = { status: 'idle' }) {
  const result: FinishedResult = { ...computeResult(state), isPersonalBest: false };
  return render(
    <MemoryRouter>
      <Results
        config={state.config}
        result={result}
        state={state}
        date="2026-01-01"
        saveState={saveState}
        onNext={vi.fn()}
        onRepeat={vi.fn()}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  useSettings.setState({ ...DEFAULT_SETTINGS, mode: 'custom', customText: '' });
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false, restartToken: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Results: sudden death failed state', () => {
  // "cat " is right, then "d" is right and "x" is wrong for "o": the test ends on word 2.
  const failedRun = () => runTyping(['cat', 'dog', 'fox'], 'cat dx', { config: { suddenDeath: true } });

  it('shows "Failed at word N" with N = the word the test ended on, and no big wpm', () => {
    const state = failedRun();
    expect(state.failed).toBe(true);
    renderResults(state);

    expect(screen.getByText('Failed at word 2')).toBeInTheDocument();
    // The big wpm number (5rem, --main) is replaced: only the small --sub figures remain.
    expect(document.querySelector('dd.text-main')).toBeNull();
  });

  it('keeps the wpm and accuracy figures, in the secondary colour', () => {
    renderResults(failedRun());
    const figures = document.querySelectorAll('dd.text-sub');
    expect(figures.length).toBeGreaterThanOrEqual(2);
    const texts = [...figures].map((el) => el.textContent ?? '');
    expect(texts.some((t) => t.endsWith('%'))).toBe(true);
  });

  it('is not saved, and says why', () => {
    renderResults(failedRun(), { status: 'skipped', reason: 'failed' });
    expect(screen.getByText('Not saved: sudden death, test failed')).toBeInTheDocument();
  });

  it('does not show the failed heading for a passed test', () => {
    renderResults(runTyping(['cat', 'dog'], 'cat dog'));
    expect(screen.queryByText(/Failed at word/)).toBeNull();
    expect(document.querySelector('dd.text-main')).not.toBeNull();
  });
});

describe('Results: slowest words', () => {
  // Each word's letters are spaced by its own gap, so "dog" is the slowest by a wide margin.
  function pacedRun(): EngineState {
    const words = ['cat', 'dog', 'fox', 'bird', 'bee', 'ant'];
    const gapPerWord = [100, 900, 120, 150, 160, 300];
    let state = createInitialState(customConfig(), words);
    let at = 1000;
    let word = 0;
    for (const ch of 'cat dog fox bird bee ant') {
      if (ch === ' ') {
        state = engineReducer(state, { type: 'space', at });
        word++;
      } else {
        state = engineReducer(state, { type: 'char', char: ch, at });
      }
      at += gapPerWord[word] ?? 100;
    }
    return state;
  }

  function slowList(): HTMLElement {
    const heading = screen.getByRole('heading', { name: 'Slowest words' });
    return heading.parentElement as HTMLElement;
  }

  it('lists up to five slowest words, slowest first, with their wpm', () => {
    renderResults(pacedRun());
    const items = within(slowList()).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items[0]).toHaveTextContent('dog');
    expect(items[0]).toHaveTextContent(/\d+ wpm/);
  });

  it('"Practice these words" sets a custom text of about 30 slow words and restarts in custom mode', () => {
    useSettings.setState({ mode: 'time' });
    renderResults(pacedRun());
    const before = useUi.getState().restartToken;
    const shown = within(slowList())
      .getAllByRole('listitem')
      .map((li) => li.querySelector('span')?.textContent ?? '');

    fireEvent.click(screen.getByRole('button', { name: 'Practice these words' }));

    const settings = useSettings.getState();
    expect(settings.mode).toBe('custom');
    const words = settings.customText.split(' ');
    expect(words).toHaveLength(30);
    expect(new Set(words)).toEqual(new Set(shown));
    expect(useUi.getState().restartToken).toBe(before + 1);
  });
});
