import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { SearchInput } from './SearchInput';

function Harness({ onCommit }: { onCommit: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <SearchInput
      value={value}
      label="Search"
      onCommit={(v) => {
        setValue(v);
        onCommit(v);
      }}
    />
  );
}

describe('SearchInput', () => {
  it('commits once, after the 300ms pause', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'kea');
    expect(onCommit).not.toHaveBeenCalled();
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('kea'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('follows a value that changes from outside', () => {
    const { rerender } = render(<SearchInput value="" label="Search" onCommit={() => undefined} />);
    rerender(<SearchInput value="macaw" label="Search" onCommit={() => undefined} />);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('macaw');
  });
});
