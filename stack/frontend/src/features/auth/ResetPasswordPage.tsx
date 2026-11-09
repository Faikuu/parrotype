import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError, authApi } from '@/lib/api';
import { validateNewPassword } from './validation';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({ next: false, confirm: false });
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: (newPassword: string) => authApi.resetPassword({ token, newPassword }),
  });

  if (!token) {
    return <ResetShell heading={t('auth:reset.heading')}><InvalidLink /></ResetShell>;
  }

  const nextKey = validateNewPassword(next);
  const mismatch = confirm !== next;
  const showNext = (touched.next || submitted) && nextKey ? t(`auth:errors.${nextKey}`) : undefined;
  const showConfirm = (touched.confirm || submitted) && mismatch ? t('auth:reset.mismatch') : undefined;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (nextKey || mismatch || mutation.isPending) return;
    mutation.mutate(next);
  }

  if (mutation.isSuccess) {
    return (
      <ResetShell heading={t('auth:reset.heading')}>
        <p role="status" className="mt-6 text-text">
          {t('auth:reset.success')}
        </p>
        <p className="mt-6">
          <Link to="/login" className="text-main underline underline-offset-4">
            {t('auth:reset.loginLink')}
          </Link>
        </p>
      </ResetShell>
    );
  }

  const error = mutation.error;
  if (error instanceof ApiError && error.status === 400) {
    return (
      <ResetShell heading={t('auth:reset.heading')}>
        <InvalidLink />
      </ResetShell>
    );
  }

  const serverError = error
    ? error instanceof ApiError && error.status !== 0
      ? error.message
      : t('common:networkError')
    : null;

  return (
    <ResetShell heading={t('auth:reset.heading')}>
      <form className="mt-8 flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('auth:reset.newPassword')}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => {
            mutation.reset();
            setNext(e.target.value);
          }}
          onBlur={() => setTouched((s) => ({ ...s, next: true }))}
          error={showNext}
        />
        <TextField
          label={t('auth:reset.confirm')}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            mutation.reset();
            setConfirm(e.target.value);
          }}
          onBlur={() => setTouched((s) => ({ ...s, confirm: true }))}
          error={showConfirm}
        />
        {serverError ? (
          <div role="alert" className="rounded-[6px] bg-surface px-3 py-2 text-error">
            {serverError}
          </div>
        ) : null}
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? t('auth:reset.submitting') : t('auth:reset.submit')}
        </Button>
      </form>
    </ResetShell>
  );
}

function ResetShell({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm py-16">
      <h1 className="text-[1.6rem] font-semibold text-text">{heading}</h1>
      {children}
    </div>
  );
}

function InvalidLink() {
  const { t } = useTranslation();
  return (
    <>
      <p role="alert" className="mt-6 text-error">
        {t('auth:reset.invalid')}
      </p>
      <p className="mt-6">
        <Link to="/forgot-password" className="text-main underline underline-offset-4">
          {t('auth:reset.requestNew')}
        </Link>
      </p>
    </>
  );
}
