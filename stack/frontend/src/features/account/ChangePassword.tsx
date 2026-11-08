import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { ApiError, authApi } from '@/lib/api';
import { validateLoginPassword, validateNewPassword } from '@/features/auth/validation';

type Field = 'current' | 'next' | 'confirm';
const EMPTY = { current: '', next: '', confirm: '' };
const NO_TOUCH: Record<Field, boolean> = { current: false, next: false, confirm: false };

export function ChangePasswordForm() {
  const { t } = useTranslation();
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState(NO_TOUCH);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(input),
  });

  // Keys under auth:errors, plus 'mismatch' which lives under account:settings.password.
  const keys: Record<Field, string | undefined> = {
    current: validateLoginPassword(values.current),
    next: validateNewPassword(values.next),
    confirm: values.confirm !== values.next ? 'mismatch' : undefined,
  };
  const shown = (f: Field) => {
    if (!(touched[f] || submitted) || !keys[f]) return undefined;
    return keys[f] === 'mismatch'
      ? t('account:settings.password.mismatch')
      : t(`auth:errors.${keys[f]}`);
  };

  function set(f: Field, v: string) {
    setValues((s) => ({ ...s, [f]: v }));
    mutation.reset();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(keys).some(Boolean)) return;
    try {
      await mutation.mutateAsync({ currentPassword: values.current, newPassword: values.next });
      setValues(EMPTY);
      setTouched(NO_TOUCH);
      setSubmitted(false);
    } catch {
      // Shown from mutation.error below.
    }
  }

  const error = mutation.error;
  const serverError = error ? (error instanceof ApiError ? error.message : t('common:networkError')) : null;

  return (
    <div>
      <h3 className="text-[1rem] font-semibold text-text">{t('account:settings.password.heading')}</h3>
      <form className="mt-4 flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('account:settings.password.current')}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={values.current}
          onChange={(e) => set('current', e.target.value)}
          onBlur={() => setTouched((s) => ({ ...s, current: true }))}
          error={shown('current')}
        />
        <TextField
          label={t('account:settings.password.new')}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={values.next}
          onChange={(e) => set('next', e.target.value)}
          onBlur={() => setTouched((s) => ({ ...s, next: true }))}
          error={shown('next')}
        />
        <TextField
          label={t('account:settings.password.confirm')}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => set('confirm', e.target.value)}
          onBlur={() => setTouched((s) => ({ ...s, confirm: true }))}
          error={shown('confirm')}
        />
        {serverError ? (
          <div role="alert" className="text-error">
            {serverError}
          </div>
        ) : null}
        {mutation.isSuccess ? (
          <p role="status" className="text-main">
            {t('account:settings.password.success')}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? t('account:settings.password.submitting')
              : t('account:settings.password.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
