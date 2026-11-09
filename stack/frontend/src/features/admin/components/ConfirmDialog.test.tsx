import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('keeps the confirm button disabled until the exact name is typed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete kea?"
        confirmLabel="Delete account"
        danger
        requireText="kea"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'ke');
    expect(confirm).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'a');
    expect(confirm).toBeEnabled();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('is a plain confirmation when no text is required', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Remove?" confirmLabel="Remove" onConfirm={onConfirm} onCancel={() => undefined} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels without confirming', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Remove?" confirmLabel="Remove" onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the server error and disables the buttons while pending', () => {
    render(
      <ConfirmDialog open title="Close?" confirmLabel="Close room" pending error="This room is busy" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This room is busy');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
