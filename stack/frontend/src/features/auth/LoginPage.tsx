import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { safeNext } from './safeNext';
import { useAuth } from './useAuth';
import { validateEmail, validateLoginPassword } from './validation';

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
      await login({ email: email.trim(), password });
      navigate(target, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('common:networkError'));
      setPending(false);
    }
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
