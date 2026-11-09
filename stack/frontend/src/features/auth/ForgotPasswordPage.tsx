import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError, authApi } from '@/lib/api';
import { validateEmail } from './validation';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: (value: string) => authApi.forgotPassword({ email: value }),
  });

  const emailKey = validateEmail(email);
  const showEmail = (touched || submitted) && emailKey;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (emailKey || mutation.isPending) return;
    mutation.mutate(email.trim());
  }

  const error = mutation.error;
  const errorText = error
    ? error instanceof ApiError && error.status === 429
      ? t('auth:forgot.tooMany')
      : error instanceof ApiError && error.status !== 0
        ? error.message
        : t('common:networkError')
    : null;

  return (
    <div className="mx-auto w-full max-w-sm py-16">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('auth:forgot.heading')}</h1>
      {mutation.isSuccess ? (
        <p role="status" className="mt-6 text-text">
          {t('auth:forgot.sent')}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sub">{t('auth:forgot.body')}</p>
          <form className="mt-8 flex flex-col gap-5" noValidate onSubmit={onSubmit}>
            <TextField
              label={t('auth:fields.email')}
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => {
                mutation.reset();
                setEmail(e.target.value);
              }}
              onBlur={() => setTouched(true)}
              error={showEmail ? t(`auth:errors.${emailKey}`) : undefined}
            />
            {errorText ? (
              <div role="alert" className="rounded-[6px] bg-surface px-3 py-2 text-error">
                {errorText}
              </div>
            ) : null}
            <Button type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? t('auth:forgot.submitting') : t('auth:forgot.submit')}
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-sub">
        <Link to="/login" className="text-main underline underline-offset-4">
          {t('auth:forgot.back')}
        </Link>
      </p>
    </div>
  );
}
