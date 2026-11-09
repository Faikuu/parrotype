import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@/i18n';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { ConfigBar } from './ConfigBar';

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS, mode: 'time', noBackspace: false, suddenDeath: false });
  useUi.setState({ isTyping: false });
});

describe('ConfigBar modifiers', () => {
  it('shows no backspace and sudden death toggles, off by default', () => {
    render(<ConfigBar />);
    const group = screen.getByRole('group', { name: 'Modifiers' });
    const noBackspace = within(group).getByRole('button', { name: 'no backspace' });
    const suddenDeath = within(group).getByRole('button', { name: 'sudden death' });
    expect(noBackspace).toHaveAttribute('aria-pressed', 'false');
    expect(suddenDeath).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles each modifier in the store and reflects it in aria-pressed', () => {
    render(<ConfigBar />);
    const group = screen.getByRole('group', { name: 'Modifiers' });

    fireEvent.click(within(group).getByRole('button', { name: 'no backspace' }));
    expect(useSettings.getState().noBackspace).toBe(true);
    expect(within(group).getByRole('button', { name: 'no backspace' })).toHaveAttribute('aria-pressed', 'true');
    expect(useSettings.getState().suddenDeath).toBe(false);

    fireEvent.click(within(group).getByRole('button', { name: 'sudden death' }));
    expect(useSettings.getState().suddenDeath).toBe(true);

    fireEvent.click(within(group).getByRole('button', { name: 'no backspace' }));
    expect(useSettings.getState().noBackspace).toBe(false);
    expect(within(group).getByRole('button', { name: 'no backspace' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is not shown in zen mode', () => {
    act(() => useSettings.setState({ mode: 'zen' }));
    render(<ConfigBar />);
    expect(screen.queryByRole('group', { name: 'Modifiers' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'sudden death' })).toBeNull();
  });

  it('shows the modifiers in the other modes, including custom', () => {
    act(() => useSettings.setState({ mode: 'custom' }));
    render(<ConfigBar />);
    expect(screen.getByRole('button', { name: 'sudden death' })).toBeInTheDocument();
  });
});
