import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { DataExport } from './DataExport';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let downloads: { name: string; href: string }[];
let createObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  downloads = [];
  createObjectURL = vi.fn(() => 'blob:mock-url');
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, href: this.href });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DataExport', () => {
  it('fetches the CSV export with credentials, then saves it through an object URL', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response('createdAt,mode\r\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="parrotype-results.csv"',
          },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<DataExport />);

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/results/me/export?format=csv');
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual([{ name: 'parrotype-results.csv', href: 'blob:mock-url' }]);
  });

  it('exports JSON with its own format', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => json([]),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<DataExport />);

    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }));

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/results/me/export?format=json');
    expect(downloads[0]?.name).toBe('parrotype-results.json');
  });

  it('shows a rate-limit message on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 429)),
    );
    render(<DataExport />);

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many downloads. Try again in a minute.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('shows a generic error and disables the buttons while a download is busy', async () => {
    let finish: (res: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))));
    render(<DataExport />);

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeDisabled();

    finish(json({ statusCode: 500, message: 'boom' }, 500));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't prepare the download. Try again.");
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
  });
});
