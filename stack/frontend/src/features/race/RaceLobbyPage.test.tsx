import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import '@/i18n';
import RaceLobbyPage from './RaceLobbyPage';

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('creates a race in the chosen language and opens its room', async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ id: 'abcd2345' }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/race']}>
        <Routes>
          <Route
            path="/race"
            element={
              <>
                <RaceLobbyPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/race/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const user = userEvent.setup();
  expect(screen.getByRole('heading', { name: 'Race' })).toBeInTheDocument();
  expect(screen.getByText('Race friends on the same quote. Share the link to invite them.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Español' }));
  expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Create race' }));

  await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/race/abcd2345'));
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/races');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body as string)).toEqual({ language: 'es' });
});
