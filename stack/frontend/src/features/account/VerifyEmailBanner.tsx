import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { ApiError, authApi } from '@/lib/api';

/** Shown on the account page while the email is unverified. Resend has its own busy and error states. */
export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const mutation = useMutation({ mutationFn: () => authApi.resendVerification() });

  const error = mutation.error;
  const errorText = !error
    ? null
    : !(error instanceof ApiError) || error.status === 0
      ? t('common:networkError')
      : error.status === 429
        ? t('account:banner.tooMany')
        : t('account:banner.failed');

  return (
    <section
      aria-labelledby="verify-banner-text"
      className="mb-8 flex flex-col gap-3 rounded-[10px] bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p id="verify-banner-text" className="text-text">
        {t('account:banner.body')}
      </p>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <Button variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? t('account:banner.sending') : t('account:banner.resend')}
        </Button>
        {mutation.isSuccess ? (
          <p role="status" className="text-[0.9rem] text-sub">
            {t('account:banner.sent')}
          </p>
        ) : null}
        {errorText ? (
          <p role="alert" className="text-[0.9rem] text-error">
            {errorText}
          </p>
        ) : null}
      </div>
    </section>
  );
}
