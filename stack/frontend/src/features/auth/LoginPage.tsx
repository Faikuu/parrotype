import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { safeNext } from './safeNext';
import { useAuth } from './useAuth';
import {
  codeForServer,
  validateEmail,
  validateLoginPassword,
  validateRecoveryCode,
  validateTotpCode,
} from './validation';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const target = safeNext(next);
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : '/register';

  const { user, isLoading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Set after the password step when two-factor sign-in is on: the ticket for the code step.
  const [ticket, setTicket] = useState<string | null>(null);

  if (isLoading) return <p className="py-16 text-sub">{t('common:loading')}</p>;
  if (user) return <Navigate to={target} replace />;

  const emailKey = validateEmail(email);
  const passwordKey = validateLoginPassword(password);
  const showEmail = (touched.email || submitted) && emailKey;
  const showPassword = (touched.password || submitted) && passwordKey;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (emailKey || passwordKey) return;
    setPending(true);
    try {
      const outcome = await login({ email: email.trim(), password });
      if (outcome.twoFactorRequired) {
        setTicket(outcome.ticket);
        setPending(false);
        return;
      }
      navigate(target, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('common:networkError'));
      setPending(false);
    }
  }

  if (ticket !== null) {
    return (
      <TwoFactorStep
        ticket={ticket}
        target={target}
        onBack={() => {
          setTicket(null);
          setPassword('');
          setServerError(null);
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm py-16">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('auth:login.heading')}</h1>
      <form className="mt-8 flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('auth:fields.email')}
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((s) => ({ ...s, email: true }))}
          error={showEmail ? t(`auth:errors.${emailKey}`) : undefined}
        />
        <div className="flex flex-col gap-1.5">
          <TextField
            label={t('auth:fields.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((s) => ({ ...s, password: true }))}
            error={showPassword ? t(`auth:errors.${passwordKey}`) : undefined}
          />
          <Link
            to="/forgot-password"
            className="self-end text-[0.9rem] text-sub underline underline-offset-4 hover:text-text"
          >
            {t('auth:forgotLink')}
          </Link>
        </div>
        {serverError ? (
          <div role="alert" className="rounded-[6px] bg-surface px-3 py-2 text-error">
            {serverError}
          </div>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t('auth:login.submitting') : t('auth:login.submit')}
        </Button>
      </form>
      <p className="mt-6 text-sub">
        {t('auth:login.noAccount')}{' '}
        <Link to={registerHref} className="text-main underline underline-offset-4">
          {t('auth:login.createLink')}
        </Link>
      </p>
    </div>
  );
}

/** The second login step: a 6-digit code, or a recovery code after the toggle. */
function TwoFactorStep({ ticket, target, onBack }: { ticket: string; target: string; onBack: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { verify2fa } = useAuth();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const codeKey = recovery ? validateRecoveryCode(code) : validateTotpCode(code);
  const showCode = submitted && codeKey ? t(`auth:twoFactor.${codeKey}`) : undefined;

  function toggleRecovery() {
    setRecovery((r) => !r);
    setCode('');
    setSubmitted(false);
    setServerError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (codeKey) return;
    setPending(true);
    try {
      await verify2fa({ ticket, code: codeForServer(code, recovery) });
      navigate(target, { replace: true });
    } catch (err) {
      setServerError(twoFactorErrorText(err, t));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm py-16">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('auth:twoFactor.heading')}</h1>
      <p className="mt-3 text-sub">
        {recovery ? t('auth:twoFactor.recoveryBody') : t('auth:twoFactor.body')}
      </p>
      <form className="mt-8 flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        {recovery ? (
          <TextField
            label={t('auth:twoFactor.recoveryCode')}
            name="recoveryCode"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="xxxx-xxxx"
            pattern="[a-zA-Z2-7]{4}-[a-zA-Z2-7]{4}"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={showCode}
          />
        ) : (
          <TextField
            label={t('auth:twoFactor.code')}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={showCode}
          />
        )}
        <button
          type="button"
          onClick={toggleRecovery}
          className="self-start text-[0.9rem] text-main underline underline-offset-4"
        >
          {recovery ? t('auth:twoFactor.useCode') : t('auth:twoFactor.useRecovery')}
        </button>
        {serverError ? (
          <div role="alert" className="rounded-[6px] bg-surface px-3 py-2 text-error">
            {serverError}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} disabled={pending}>
            {t('auth:twoFactor.back')}
          </Button>
          <Button type="submit" disabled={pending} className="flex-1">
            {pending ? t('auth:twoFactor.submitting') : t('auth:twoFactor.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function twoFactorErrorText(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t('common:networkError');
    if (err.status === 429) return t('auth:twoFactor.tooMany');
    if (err.status === 400 || err.status === 401) return t('auth:twoFactor.wrong');
    return err.message;
  }
  return t('common:networkError');
}
