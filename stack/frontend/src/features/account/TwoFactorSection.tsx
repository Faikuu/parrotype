import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { TextField } from '@/components/TextField';
import { ME_QUERY_KEY } from '@/features/auth/useAuth';
import { codeForServer, validateTotpCode } from '@/features/auth/validation';
import { ApiError, authApi } from '@/lib/api';
import type { RecoveryCodesResponse, TwoFactorSetupResponse } from '@/lib/api/types';

type Dialog = 'regenerate' | 'disable' | null;

// Destructive actions. The Button variants set their own text colour, so these are plain elements.
const DANGER_TEXT =
  'rounded-[6px] px-2 py-2 text-[0.95rem] font-medium text-error transition-colors hover:underline disabled:opacity-50';
const DANGER_FILL =
  'inline-flex items-center justify-center rounded-[6px] bg-error px-4 py-2 text-[0.95rem] font-medium text-bg disabled:pointer-events-none disabled:opacity-50';

/** Two-factor sign-in on the account page. The view follows the server's state, except for the recovery codes shown once. */
export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  // The codes from enable or regenerate. They are shown once, until the user says they saved them.
  const [codes, setCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [status, setStatus] = useState<string | null>(null);

  const startSetup = useMutation({
    mutationFn: () => authApi.setupTwoFactor(),
    onSuccess: (res) => {
      setStatus(null);
      setSetup(res);
    },
  });

  function refreshMe() {
    void qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }

  const errorText = (err: unknown) =>
    err instanceof ApiError && err.status === 0 ? t('common:networkError') : err instanceof ApiError ? err.message : t('common:networkError');

  return (
    <section aria-labelledby="security-heading" className="flex flex-col gap-4">
      <h3 id="security-heading" className="text-[1rem] font-semibold text-text">
        {t('account:security.heading')}
      </h3>

      {codes ? (
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
            setStatus(t('account:security.saved'));
          }}
        />
      ) : enabled ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-text">
            <CheckCircle2 size={18} aria-hidden="true" className="text-main" />
            {t('account:security.on')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={() => setDialog('regenerate')}>
              {t('account:security.regenerate')}
            </Button>
            <button type="button" className={DANGER_TEXT} onClick={() => setDialog('disable')}>
              {t('account:security.turnOff')}
            </button>
          </div>
          {status ? (
            <p role="status" className="text-[0.9rem] text-sub">
              {status}
            </p>
          ) : null}
        </div>
      ) : setup ? (
        <SetupPanel
          setup={setup}
          onCancel={() => setSetup(null)}
          onEnabled={(recoveryCodes) => {
            setSetup(null);
            setCodes(recoveryCodes);
            refreshMe();
          }}
          errorText={errorText}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sub">{t('account:security.off')}</p>
          <div>
            <Button disabled={startSetup.isPending} onClick={() => startSetup.mutate()}>
              {t('account:security.setup')}
            </Button>
          </div>
          {startSetup.error ? (
            <p role="alert" className="text-error">
              {errorText(startSetup.error)}
            </p>
          ) : null}
          {status ? (
            <p role="status" className="text-[0.9rem] text-sub">
              {status}
            </p>
          ) : null}
        </div>
      )}

      <TwoFactorDialog
        mode={dialog}
        onClose={() => setDialog(null)}
        onRegenerated={(recoveryCodes) => {
          setDialog(null);
          setCodes(recoveryCodes);
        }}
        onDisabled={() => {
          setDialog(null);
          setStatus(t('account:security.turnedOff'));
          refreshMe();
        }}
      />
    </section>
  );
}

function SetupPanel({
  setup,
  onCancel,
  onEnabled,
  errorText,
}: {
  setup: TwoFactorSetupResponse;
  onCancel: () => void;
  onEnabled: (recoveryCodes: string[]) => void;
  errorText: (err: unknown) => string;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

  const qr = useQuery({
    queryKey: ['2fa-qr', setup.otpauthUrl],
    queryFn: () => QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 192 }),
    staleTime: Infinity,
  });

  const enable = useMutation({
    mutationFn: (value: string) => authApi.enableTwoFactor({ code: value }),
    onSuccess: (res) => onEnabled(res.recoveryCodes),
  });

  const codeKey = validateTotpCode(code);
  const groups = setup.secret.match(/.{1,4}/g)?.join(' ') ?? setup.secret;

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied('ok');
    } catch {
      setCopied('failed');
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (codeKey || enable.isPending) return;
    enable.mutate(codeForServer(code, false));
  }

  const wrong = enable.error instanceof ApiError && (enable.error.status === 400 || enable.error.status === 401);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sub">{t('account:security.setupIntro')}</p>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {qr.data ? (
          <img
            src={qr.data}
            alt={t('account:security.qrAlt')}
            width={192}
            height={192}
            className="h-48 w-48 shrink-0 rounded-[6px] bg-white p-1"
          />
        ) : qr.isError ? (
          <p role="alert" className="text-error">
            {t('account:security.qrFailed')}
          </p>
        ) : (
          <p className="text-sub">{t('common:loading')}</p>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[0.9rem] text-sub">{t('account:security.secretLabel')}</p>
          <p className="tabular font-mono text-[1.05rem] break-all text-text" data-testid="two-factor-secret">
            {groups}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => void copySecret()}>
              {t('account:security.copyKey')}
            </Button>
            {copied === 'ok' ? (
              <span role="status" className="text-[0.9rem] text-sub">
                {t('account:security.copied')}
              </span>
            ) : null}
            {copied === 'failed' ? (
              <span role="alert" className="text-[0.9rem] text-error">
                {t('account:security.copyFailed')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <form className="flex max-w-sm flex-col gap-4" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('account:security.codeLabel')}
          name="totpCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => {
            enable.reset();
            setCode(e.target.value);
          }}
          error={submitted && codeKey ? t(`auth:twoFactor.${codeKey}`) : undefined}
        />
        {enable.error ? (
          <p role="alert" className="text-error">
            {wrong ? t('account:security.wrongCode') : errorText(enable.error)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={enable.isPending}>
            {enable.isPending ? t('account:security.enabling') : t('account:security.enable')}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={enable.isPending}>
            {t('account:security.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // The object URL is revoked as soon as the download has been started.
  function download() {
    const blob = new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'parrotype-recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-[0.95rem] font-semibold text-text">{t('account:security.codes.heading')}</h4>
      <p className="text-sub">{t('account:security.codes.body')}</p>
      <ul aria-label={t('account:security.codes.list')} className="grid max-w-md grid-cols-2 gap-x-6 gap-y-2 rounded-[10px] bg-surface p-4 font-mono text-[1rem] text-text">
        {codes.map((code) => (
          <li key={code} className="tabular">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" onClick={() => void copyCodes()}>
          {t('account:security.codes.copy')}
        </Button>
        <Button variant="ghost" onClick={download}>
          {t('account:security.codes.download')}
        </Button>
      </div>
      {copied ? (
        <p role="status" className="text-[0.9rem] text-sub">
          {t('account:security.copied')}
        </p>
      ) : null}
      <div>
        <Button onClick={onDone}>{t('account:security.codes.done')}</Button>
      </div>
    </div>
  );
}

/** Regenerate and turn off both need the password and a code (an authenticator code or a recovery code). */
function TwoFactorDialog({
  mode,
  onClose,
  onRegenerated,
  onDisabled,
}: {
  mode: Dialog;
  onClose: () => void;
  onRegenerated: (codes: string[]) => void;
  onDisabled: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const mutation = useMutation({
    mutationFn: async (input: { password: string; code: string }): Promise<RecoveryCodesResponse | null> => {
      if (mode === 'regenerate') return authApi.regenerateRecoveryCodes(input);
      await authApi.disableTwoFactor(input);
      return null;
    },
    onSuccess: (res) => {
      if (res) onRegenerated(res.recoveryCodes);
      else onDisabled();
    },
  });

  const error = mutation.error;
  const errorText = !error
    ? null
    : error instanceof ApiError && error.status === 0
      ? t('common:networkError')
      : error instanceof ApiError && error.status === 429
        ? t('account:security.dialog.tooMany')
        : t('account:security.dialog.failed');

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password || !code.trim() || mutation.isPending) return;
    const trimmed = code.trim();
    // A 6-digit code may be typed with a space in the middle. Recovery codes keep their dash.
    const sent = /^[\d\s]+$/.test(trimmed) ? trimmed.replace(/\s/g, '') : trimmed;
    mutation.mutate({ password, code: sent });
  }

  const isRegenerate = mode === 'regenerate';
  const submitDisabled = mutation.isPending || !password || !code.trim();
  const submitLabel = mutation.isPending
    ? t('account:security.dialog.submitting')
    : isRegenerate
      ? t('account:security.dialog.submitRegenerate')
      : t('account:security.dialog.submitDisable');
  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={isRegenerate ? t('account:security.dialog.regenerateTitle') : t('account:security.dialog.disableTitle')}
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        <p className="text-sub">
          {isRegenerate ? t('account:security.dialog.regenerateBody') : t('account:security.dialog.disableBody')}
        </p>
        <TextField
          label={t('account:security.dialog.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          data-autofocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label={t('account:security.dialog.code')}
          name="code"
          autoComplete="one-time-code"
          spellCheck={false}
          autoCapitalize="none"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {errorText ? (
          <p role="alert" className="text-error">
            {errorText}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            {t('account:security.dialog.cancel')}
          </Button>
          {isRegenerate ? (
            <Button type="submit" disabled={submitDisabled}>
              {submitLabel}
            </Button>
          ) : (
            <button type="submit" className={DANGER_FILL} disabled={submitDisabled}>
              {submitLabel}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
