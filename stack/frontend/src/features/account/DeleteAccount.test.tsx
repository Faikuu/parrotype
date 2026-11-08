import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import { useKeyStats } from '@/store/keyStats';
import { useLocalBests } from '@/store/localBests';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { DeleteAccountForm } from './DeleteAccount';

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS, focusMode: false });
  useLocalBests.setState({ bests: {}, recentWpm: [] });
  useKeyStats.setState({ byLanguage: {} });
  localStorage.clear();
});

describe('DeleteAccountForm', () => {
  it('clears local results after the account is deleted, and keeps the settings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    // Personal results and a visual setting, both stored in this browser.
    useLocalBests.getState().record('time|30|en|0|0', { wpm: 80, accuracy: 96 });
    useKeyStats.getState().record({ q: { hits: 1, misses: 3 } }, 'en');
    useSettings.setState({ focusMode: true });
    expect(localStorage.getItem('parrotype:bests')).not.toBeNull();
    expect(localStorage.getItem('parrotype:keystats')).not.toBeNull();

    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/account']}>
          <Routes>
            <Route path="/" element={<p>home page</p>} />
            <Route path="/account" element={<DeleteAccountForm name="kea" onLeaving={() => {}} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(container.querySelector('input[name="password"]')!, 'correct-password');
    await userEvent.type(container.querySelector('input[name="confirmName"]')!, 'kea');
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText('home page')).toBeInTheDocument();
    await waitFor(() => expect(useLocalBests.getState().bests).toEqual({}));
    expect(useLocalBests.getState().recentWpm).toEqual([]);
    expect(useKeyStats.getState().byLanguage).toEqual({});
    expect(localStorage.getItem('parrotype:bests')).toBeNull();
    expect(localStorage.getItem('parrotype:keystats')).toBeNull();

    // Settings are not personal results: they stay, in memory and in storage.
    expect(useSettings.getState().focusMode).toBe(true);
    expect(localStorage.getItem('parrotype:settings')).toContain('"focusMode":true');
  });
});
