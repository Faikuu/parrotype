import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { computeResult } from '@/lib/engine/stats';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { Results } from './Results';
import { customConfig, runTyping } from './fixtures';
import { MISMATCH_MESSAGE, type FinishedResult, type SaveState } from './useTypingTest';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function renderWith(saveState: SaveState) {
  const state = runTyping(['hello', 'world'], 'hello world', { config: { mode: 'custom' } });
  const result: FinishedResult = { ...computeResult(state), isPersonalBest: false };
  return render(
    <MemoryRouter>
      <Results
        config={customConfig({ mode: 'custom' })}
        result={result}
        state={state}
        date="2026-11-09"
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

describe('Results: verification', () => {
  it('shows Verified with a check mark and its explanation when the server verified the replay', () => {
    const { container } = renderWith({ status: 'saved', verified: true });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByTitle('The server re-ran your keystrokes and they match this result')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows Not verified for a saved result without a checkable replay', () => {
    renderWith({ status: 'saved', verified: false });
    expect(screen.getByText('Not verified')).toBeInTheDocument();
    expect(screen.queryByText('Verified')).toBeNull();
  });

  it("says the result was not saved when the keystrokes did not match", () => {
    renderWith({ status: 'rejected', message: MISMATCH_MESSAGE });
    expect(screen.getByRole('alert')).toHaveTextContent("Not saved: the result didn't match its keystrokes");
  });

  it("gives the server's reason for any other refusal", () => {
    renderWith({ status: 'rejected', message: "The text doesn't match a known quote" });
    expect(screen.getByRole('alert')).toHaveTextContent("Not saved: The text doesn't match a known quote");
  });

  it("says funboxed tests are not saved", () => {
    renderWith({ status: 'skipped', reason: 'funbox' });
    expect(screen.getByText("Funbox results aren't saved")).toBeInTheDocument();
  });
});
