import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { TextField } from '@/components/TextField';
import { ME_QUERY_KEY } from '@/features/auth/useAuth';
import { ApiError, authApi } from '@/lib/api';

interface Props {
  /** The signed-in user's name; the user has to type it to confirm. */
  name: string;
  /** Called with true while the deletion runs, so the account page does not redirect to login. */
  onLeaving: (leaving: boolean) => void;
}

export function DeleteAccountForm({ name, onLeaving }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');

  const mutation = useMutation({
    mutationFn: (input: { password: string }) => authApi.deleteAccount(input),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(ME_QUERY_KEY, null);
      navigate('/', { replace: true });
    },
    onError: () => onLeaving(false),
  });

  const ready = password.length > 0 && typed === name;
  const serverError = mutation.error
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : t('common:networkError')
    : null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || mutation.isPending) return;
    onLeaving(true);
    mutation.mutate({ password });
  }

  return (
    <div>
      <h3 className="text-[1rem] font-semibold text-text">{t('account:settings.delete.heading')}</h3>
      <p className="mt-2 text-sub">{t('account:settings.delete.body')}</p>
      <form className="mt-4 flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        <TextField
          label={t('auth:fields.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label={t('account:settings.delete.confirmLabel', { name })}
          name="confirmName"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        {serverError ? (
          <div role="alert" className="text-error">
            {serverError}
          </div>
        ) : null}
        <div>
          <button
            type="submit"
            disabled={!ready || mutation.isPending}
            className="rounded-[6px] bg-transparent px-1 py-2 text-[0.95rem] font-medium text-error underline-offset-4 transition-colors hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            {mutation.isPending
              ? t('account:settings.delete.submitting')
              : t('account:settings.delete.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
