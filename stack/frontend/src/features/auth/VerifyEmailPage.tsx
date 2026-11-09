import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ApiError, authApi } from '@/lib/api';
import { ME_QUERY_KEY } from './useAuth';

type Status = 'verifying' | 'ok' | 'invalid' | 'error';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'invalid');
  // StrictMode runs the effect twice in development. The ref keeps it to one request.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authApi.verifyEmail({ token }).then(
      () => {
        setStatus('ok');
        // A signed-in user's account banner should drop the warning without a reload.
        void qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
      },
      (err: unknown) => {
        setStatus(err instanceof ApiError && err.status === 400 ? 'invalid' : 'error');
      },
    );
  }, [token, qc]);

  return (
    <div className="mx-auto w-full max-w-sm py-16">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('auth:verify.heading')}</h1>
      {status === 'verifying' ? (
        <p role="status" className="mt-6 text-sub">
          {t('auth:verify.verifying')}
        </p>
      ) : null}
      {status === 'ok' ? (
        <>
          <p role="status" className="mt-6 text-text">
            {t('auth:verify.success')}
          </p>
          <p className="mt-6">
            <Link to="/account" className="text-main underline underline-offset-4">
              {t('auth:verify.accountLink')}
            </Link>
          </p>
        </>
      ) : null}
      {status === 'invalid' ? (
        <>
          <p role="alert" className="mt-6 text-error">
            {t('auth:verify.invalid')}
          </p>
          <p className="mt-3 text-sub">{t('auth:verify.invalidBody')}</p>
          <p className="mt-6">
            <Link to="/login?next=/account" className="text-main underline underline-offset-4">
              {t('auth:verify.loginLink')}
            </Link>
          </p>
        </>
      ) : null}
      {status === 'error' ? (
        <p role="alert" className="mt-6 text-error">
          {t('auth:verify.error')}
        </p>
      ) : null}
    </div>
  );
}
