import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QRCode from 'qrcode';
import '@/i18n';
import { TwoFactorSection } from './TwoFactorSection';
import { VerifyEmailBanner } from './VerifyEmailBanner';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QRCODE') },
}));

const SECRET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const OTPAUTH = `otpauth://totp/ParroType:kea?secret=${SECRET}&issuer=ParroType`;
const CODES = Array.from({ length: 10 }, (_, i) => `k${i}ab-cd${i}2`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function bodyOf(fn: ReturnType<typeof vi.fn>, suffix: string): unknown[] {
  return fn.mock.calls
    .filter(([input]) => String(input).endsWith(suffix))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as unknown);
}

/** Routes the account calls the section makes. Each route answers once per call. */
function api(routes: Record<string, () => Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '');
    const route = routes[path];
    if (!route) return json({ message: `Unexpected ${path}` }, 500);
    return route();
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderSection(enabled: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TwoFactorSection enabled={enabled} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(QRCode.toDataURL).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  const objectUrl = URL as unknown as Partial<Record<'createObjectURL' | 'revokeObjectURL', unknown>>;
  delete objectUrl.createObjectURL;
  delete objectUrl.revokeObjectURL;
});

describe('TwoFactorSection setup', () => {
  it('renders the QR from otpauthUrl, the key in groups of four, then shows the recovery codes after enable', async () => {
    const fetchMock = api({
      '/auth/2fa/setup': () => json({ secret: SECRET, otpauthUrl: OTPAUTH }),
      '/auth/2fa/enable': () => json({ recoveryCodes: CODES }),
    });
    renderSection(false);
    await userEvent.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));

    const qr = await screen.findByRole('img', { name: 'QR code for your authenticator app' });
    expect(qr).toHaveAttribute('src', 'data:image/png;base64,QRCODE');
    expect(QRCode.toDataURL).toHaveBeenCalledWith(OTPAUTH, expect.objectContaining({ width: 192 }));
    expect(screen.getByTestId('two-factor-secret')).toHaveTextContent('ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567');

    await userEvent.type(screen.getByLabelText('Code from your app'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(within(list).getByText(CODES[0]!)).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/auth/2fa/enable')).toEqual([{ code: '123456' }]);

    await userEvent.click(screen.getByRole('button', { name: "I've saved these codes" }));
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Recovery codes saved.');
  });

  it('copies the key and says so', async () => {
    api({ '/auth/2fa/setup': () => json({ secret: SECRET, otpauthUrl: OTPAUTH }) });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderSection(false);

    await userEvent.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Copy key' }));

    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('downloads the recovery codes as parrotype-recovery-codes.txt', async () => {
    api({
      '/auth/2fa/setup': () => json({ secret: SECRET, otpauthUrl: OTPAUTH }),
      '/auth/2fa/enable': () => json({ recoveryCodes: CODES }),
    });
    const createObjectURL = vi.fn(() => 'blob:codes');
    const revokeObjectURL = vi.fn();
    // jsdom has no object URLs; these are added for this test only.
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    renderSection(false);

    await userEvent.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
    await userEvent.type(await screen.findByLabelText('Code from your app'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Download .txt' }));

    expect(clicked).toEqual(['parrotype-recovery-codes.txt']);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:codes');
  });

  it('shows a wrong-code message when the enable code is rejected', async () => {
    api({
      '/auth/2fa/setup': () => json({ secret: SECRET, otpauthUrl: OTPAUTH }),
      '/auth/2fa/enable': () => json({ message: 'Wrong code' }, 400),
    });
    renderSection(false);

    await userEvent.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
    await userEvent.type(await screen.findByLabelText('Code from your app'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work.");
  });
});

describe('TwoFactorSection when on', () => {
  it('disable sends the password and the code, then shows that it is off', async () => {
    const fetchMock = api({ '/auth/2fa/disable': () => json({ ok: true }) });
    renderSection(true);

    expect(screen.getByText('Two-factor sign-in is on. You log in with your password and a code from your app.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn off two-factor' }));

    const dialog = await screen.findByRole('dialog', { name: 'Turn off two-factor' });
    await userEvent.type(within(dialog).getByLabelText('Password'), 'correct-horse');
    await userEvent.type(within(dialog).getByLabelText('Code from your app or a recovery code'), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));

    expect(await screen.findByText('Two-factor sign-in is off.')).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/auth/2fa/disable')).toEqual([{ password: 'correct-horse', code: '123456' }]);
  });

  it('regenerate needs the password and a code, then shows the new codes', async () => {
    const fetchMock = api({ '/auth/2fa/recovery-codes': () => json({ recoveryCodes: CODES }) });
    renderSection(true);

    await userEvent.click(screen.getByRole('button', { name: 'Regenerate recovery codes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate recovery codes' });
    await userEvent.type(within(dialog).getByLabelText('Password'), 'correct-horse');
    await userEvent.type(within(dialog).getByLabelText('Code from your app or a recovery code'), 'abcd-2345');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Regenerate' }));

    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/auth/2fa/recovery-codes')).toEqual([{ password: 'correct-horse', code: 'abcd-2345' }]);
  });
});

describe('VerifyEmailBanner', () => {
  it('shows a busy state while resending, then confirms', async () => {
    let finish: () => void = () => undefined;
    const gate = new Promise<Response>((resolve) => {
      finish = () => resolve(json({ ok: true }));
    });
    vi.stubGlobal('fetch', vi.fn(() => gate));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <VerifyEmailBanner />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Verify your email to appear on leaderboards.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();

    finish();
    expect(await screen.findByRole('status')).toHaveTextContent('Sent. Check your inbox.');
  });

  it('shows the rate limit message on 429', async () => {
    api({ '/auth/email/resend': () => json({ message: 'Too many' }, 429) });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <VerifyEmailBanner />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have asked for too many emails. Try again later.',
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resend email' })).toBeEnabled());
  });
});
