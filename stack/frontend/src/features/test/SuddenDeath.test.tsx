import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import TestPage from './TestPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Unauthorized' })));
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  useSettings.setState({
    ...DEFAULT_SETTINGS,
    mode: 'custom',
    customText: 'parrot echoes words',
    suddenDeath: true,
    noBackspace: false,
    focusMode: false,
    smoothCaret: false,
  });
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sudden death in the test page', () => {
  it('ends the test on the first wrong letter and shows the failed result, not saved', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <TestPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'Typing input' });
    await act(async () => input.focus());

    // "parrot": p, a, then a wrong letter for r.
    await user.keyboard('pax');

    expect(screen.getByText('Failed at word 1')).toBeInTheDocument();
    expect(screen.getByText('Not saved: sudden death, test failed')).toBeInTheDocument();
    // Nothing is posted: the result is not a save.
    const posts = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url, init]) => String(url).includes('/results') && (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
  });
});
