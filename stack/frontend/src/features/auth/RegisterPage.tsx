import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError } from '@/lib/api';
import { safeNext } from './safeNext';
import { useAuth } from './useAuth';
import { validateEmail, validateName, validateNewPassword } from './validation';

type Field = 'name' | 'email' | 'password';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const target = safeNext(next);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  const { user, isLoading, register } = useAuth();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState<Record<Field, boolean>>({
    name: false,
    email: false,
    password: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (isLoading) return <p className="py-16 text-sub">{t('common:loading')}</p>;
  if (user) return <Navigate to={target} replace />;

  const keys: Record<Field, string | undefined> = {
    name: validateName(values.name.trim()),
    email: validateEmail(values.email),
    password: validateNewPassword(values.password),
  };
  const hasErrors = Object.values(keys).some(Boolean);
  const shown = (f: Field) => ((touched[f] || submitted) && keys[f] ? t(`auth:errors.${keys[f]}`) : undefined);

  function set(f: Field, v: string) {
    setValues((s) => ({ ...s, [f]: v }));
  }
  function blur(f: Field) {
    setTouched((s) => ({ ...s, [f]: true }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (hasErrors) return;
    setPending(true);
    try {
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      navigate(target, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('common:networkError'));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm py-16">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('auth:register.heading')}</h1>
      <form className="mt-8 flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('auth:fields.name')}
          name="name"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => blur('name')}
          error={shown('name')}
        />
        <TextField
          label={t('auth:fields.email')}
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          onBlur={() => blur('email')}
          error={shown('email')}
        />
        <TextField
          label={t('auth:fields.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          onBlur={() => blur('password')}
          error={shown('password')}
        />
        {serverError ? (
          <div role="alert" className="rounded-[6px] bg-surface px-3 py-2 text-error">
            {serverError}
          </div>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t('auth:register.submitting') : t('auth:register.submit')}
        </Button>
      </form>
      <p className="mt-6 text-sub">
        {t('auth:register.haveAccount')}{' '}
        <Link to={loginHref} className="text-main underline underline-offset-4">
          {t('auth:register.loginLink')}
        </Link>
      </p>
    </div>
  );
}
