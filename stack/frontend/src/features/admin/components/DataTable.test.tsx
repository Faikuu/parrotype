import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import '@/i18n';
import { DataTable, type Column } from './DataTable';
import { useUrlState, pageNumber } from '../useUrlState';

interface Row {
  id: number;
  name: string;
  wpm: number;
}

const ROWS: Row[] = [
  { id: 1, name: 'kea', wpm: 90 },
  { id: 2, name: 'macaw', wpm: 120 },
];

const DEFAULTS = { sort: 'name', order: 'asc', page: '1' } as const;

const COLUMNS: Column<Row>[] = [
  { id: 'name', header: 'Name', sortKey: 'name', defaultOrder: 'asc', cell: (r) => r.name },
  { id: 'wpm', header: 'wpm', sortKey: 'wpm', defaultOrder: 'desc', align: 'end', cell: (r) => r.wpm },
];

/** A table wired to the URL the way the admin pages wire it. */
function Harness({ total = 60 }: { total?: number }) {
  const { values, update } = useUrlState<keyof typeof DEFAULTS>(DEFAULTS);
  const page = pageNumber(values.page);
  return (
    <DataTable
      caption="Players"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(r) => r.id}
      empty="Nobody."
      sort={{ key: values.sort, order: values.order === 'asc' ? 'asc' : 'desc' }}
      onSort={(s) => update({ sort: s.key, order: s.order })}
      pagination={{ page, pageSize: 25, total, onPageChange: (p) => update({ page: String(p) }) }}
    />
  );
}

function UrlProbe() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}

function renderTable(url = '/admin/users', total?: number) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Harness total={total} />
      <UrlProbe />
    </MemoryRouter>,
  );
}

const url = () => screen.getByTestId('url').textContent ?? '';

describe('DataTable sorting and pagination', () => {
  it('starts a new column in its default order and flips it on the next click', async () => {
    const user = userEvent.setup();
    renderTable('/admin/users?sort=name&order=asc');
    const header = screen.getByRole('columnheader', { name: /wpm/ });
    expect(header).toHaveAttribute('aria-sort', 'none');

    await user.click(within(header).getByRole('button'));
    expect(url()).toContain('sort=wpm');
    expect(url()).toContain('order=desc');
    expect(header).toHaveAttribute('aria-sort', 'descending');

    // asc is this harness's default, so the URL leaves the parameter out.
    await user.click(within(header).getByRole('button'));
    expect(url()).not.toContain('order=desc');
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  it('moves between pages through the URL and shows the range', async () => {
    const user = userEvent.setup();
    renderTable('/admin/users', 60);
    expect(screen.getByText('1–25 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(url()).toContain('page=2');
    expect(screen.getByText('26–50 of 60')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('51–60 of 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('goes back to the first page when the sort changes', async () => {
    const user = userEvent.setup();
    renderTable('/admin/users?page=3');
    await user.click(within(screen.getByRole('columnheader', { name: /wpm/ })).getByRole('button'));
    expect(url()).not.toContain('page=');
  });

  it('shows the empty state when there are no rows', () => {
    render(
      <MemoryRouter>
        <DataTable caption="Empty" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} empty="Nobody here." />
      </MemoryRouter>,
    );
    expect(screen.getByText('Nobody here.')).toBeInTheDocument();
  });
});
