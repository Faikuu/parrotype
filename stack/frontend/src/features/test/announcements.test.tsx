import { act, render, screen } from '@testing-library/react';
import '@/i18n';
import { MISMATCH_MESSAGE } from './useTypingTest';
import { announcementFor, saveAnnouncement } from './announcements';
import { ANNOUNCE_DELAY_MS, TestAnnouncer } from './TestAnnouncer';
import i18n from '@/i18n';

const t = (key: string, options?: Record<string, unknown>) => String(i18n.t(key, options as never));

describe('announcements', () => {
  it('announces the start and the finish with its numbers, not the keystrokes', () => {
    expect(announcementFor({ started: true, finished: null, save: { status: 'idle' } }, t)).toBe('Test started');
    expect(
      announcementFor(
        { started: true, finished: { wpm: 91.6, accuracy: 96.4, failedWord: null }, save: { status: 'idle' } },
        t,
      ),
    ).toBe('Test finished: 92 words per minute, 96 percent accuracy');
    expect(
      announcementFor({ started: true, finished: { wpm: 40, accuracy: 60, failedWord: 7 }, save: { status: 'idle' } }, t),
    ).toBe('Test failed at word 7');
    expect(announcementFor({ started: false, finished: null, save: { status: 'idle' } }, t)).toBe('');
  });

  it('joins the finish with the save state, so the score is still read when the save lands', () => {
    const message = announcementFor(
      { started: true, finished: { wpm: 80, accuracy: 99, failedWord: null }, save: { status: 'saved', verified: true } },
      t,
    );
    expect(message).toBe('Test finished: 80 words per minute, 99 percent accuracy Result saved and verified.');
  });

  it('describes each save state', () => {
    expect(saveAnnouncement({ status: 'saved', verified: false }, t)).toBe('Result saved, not verified.');
    expect(saveAnnouncement({ status: 'rejected', message: MISMATCH_MESSAGE }, t)).toBe(
      "Not saved: the result didn't match its keystrokes",
    );
    expect(saveAnnouncement({ status: 'skipped', reason: 'funbox' }, t)).toBe("Funbox results aren't saved");
    expect(saveAnnouncement({ status: 'anonymous' }, t)).toBe('');
    expect(saveAnnouncement({ status: 'idle' }, t)).toBe('');
  });
});

describe('TestAnnouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads one debounced message, not every change', () => {
    const idle = { started: false, finished: null, save: { status: 'idle' as const } };
    const { rerender } = render(<TestAnnouncer input={idle} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');

    rerender(<TestAnnouncer input={{ ...idle, started: true }} />);
    // A change inside the delay replaces the pending message: only the last one is read.
    rerender(<TestAnnouncer input={{ ...idle, started: true, save: { status: 'saving' } }} />);
    expect(region).toHaveTextContent('');
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS + 10);
    });
    expect(region).toHaveTextContent('Test started Saving the result.');
  });
});
