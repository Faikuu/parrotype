import { act, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { ReplayPlayer } from './ReplayPlayer';
import { customConfig, runTyping } from './fixtures';

const WORDS = ['cat', 'dog'];
// Typing "cat dog" at 200 ms a key from 1000 ms: the last letter at 2200 ms finishes the test, so the replay lasts 1200 ms.
const FINAL = runTyping(WORDS, 'cat dog', { start: 1000, step: 200 });

/** A requestAnimationFrame that only runs when the test says so. */
function controlFrames() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const raf = vi.fn((cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  const caf = vi.fn((id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
  return {
    raf,
    caf,
    pending: () => frames.size,
    /** Runs the frames that are waiting, at the given timestamp. */
    tick(now: number) {
      const waiting = [...frames.entries()];
      frames.clear();
      for (const [, cb] of waiting) cb(now);
    },
  };
}

function renderPlayer() {
  return render(
    <ReplayPlayer config={customConfig()} words={WORDS} events={FINAL.events} final={FINAL} />,
  );
}

function scrubber(): HTMLInputElement {
  return screen.getByRole('slider', { name: 'Replay position' }) as HTMLInputElement;
}

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS });
  useUi.setState({ isTyping: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReplayPlayer', () => {
  it('has a duration of the finish minus the start, and starts at zero', () => {
    renderPlayer();
    const duration = FINAL.finishedAt! - FINAL.startedAt!;
    expect(duration).toBe(1200);
    expect(Number(scrubber().max)).toBe(duration);
    expect(scrubber().value).toBe('0');
    expect(screen.getByText(`0.0 s / ${(duration / 1000).toFixed(1)} s`)).toBeInTheDocument();
  });

  it('scrubbing to the end shows the final typed text', () => {
    renderPlayer();
    fireEvent.change(scrubber(), { target: { value: scrubber().max } });

    // Both words are fully typed and correct, so every letter is in the correct colour.
    for (const index of [0, 1]) {
      const letters = document.querySelectorAll<HTMLElement>(`[data-word="${index}"] [data-c]`);
      expect(letters.length).toBe(WORDS[index]!.length);
      letters.forEach((el) => expect(el.className).toContain('text-text'));
    }
    // The finished test hides the caret.
    expect(document.querySelector<HTMLElement>('.test-caret')?.style.display).toBe('none');
  });

  it('scrubbing part way shows the text typed up to that point', () => {
    renderPlayer();
    // After the first three letters (at 1000, 1200, 1400 ms) the first word is complete but not left.
    fireEvent.change(scrubber(), { target: { value: '450' } });
    const first = document.querySelectorAll<HTMLElement>('[data-word="0"] [data-c]');
    expect([...first].map((el) => el.className.includes('text-text'))).toEqual([true, true, true]);
    const second = document.querySelectorAll<HTMLElement>('[data-word="1"] [data-c]');
    expect([...second].every((el) => el.className.includes('text-sub'))).toBe(true);
  });

  it('plays on requestAnimationFrame at the chosen speed and pauses', () => {
    const frames = controlFrames();
    renderPlayer();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(frames.pending()).toBe(1);

    act(() => frames.tick(5000)); // first frame sets the reference time, no movement yet
    act(() => frames.tick(5100)); // 100 ms later at 1x
    expect(Number(scrubber().value)).toBe(100);

    fireEvent.click(screen.getByRole('button', { name: '2×' }));
    expect(screen.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true');
    act(() => frames.tick(5200)); // 100 ms at 2x = 200 ms more
    expect(Number(scrubber().value)).toBe(300);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(frames.pending()).toBe(0);
  });

  it('stops at the end and plays again from the start', () => {
    const frames = controlFrames();
    renderPlayer();
    const duration = Number(scrubber().max);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => frames.tick(0));
    act(() => frames.tick(duration + 1000));
    expect(scrubber().value).toBe(String(duration));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(frames.pending()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => frames.tick(10_000));
    act(() => frames.tick(10_050));
    expect(Number(scrubber().value)).toBe(50);
  });

  it('cancels its pending frame on unmount', () => {
    const frames = controlFrames();
    const { unmount } = renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(frames.pending()).toBe(1);
    unmount();
    expect(frames.caf).toHaveBeenCalled();
    expect(frames.pending()).toBe(0);
  });

  it('turns the smooth caret off when the user asks for reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    useSettings.setState({ smoothCaret: true });
    renderPlayer();
    // The caret is placed by layout in the browser; with reduced motion the replay sets no glide transition.
    const caret = document.querySelector<HTMLElement>('.test-caret');
    expect(caret?.style.transition).toBe('none');
  });
});
