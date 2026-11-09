import { useId, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { ApiError, usersApi } from '@/lib/api';
import type { PublicProfile, ReportReason } from '@/lib/api/types';

const REPORT_REASONS: ReportReason[] = ['name', 'cheating', 'other'];
const DETAILS_MAX = 500;

/** The profile with the follow change applied: the flag flips and the follower count moves by one. */
function applyFollow(profile: PublicProfile, following: boolean): PublicProfile {
  if (profile.isFollowing === following) return profile;
  return {
    ...profile,
    isFollowing: following,
    followers: Math.max(0, profile.followers + (following ? 1 : -1)),
  };
}

/**
 * Follow or unfollow, with the change shown at once. A failed request puts the profile back as it was,
 * and the error is shown beside the button.
 */
export function FollowButton({ name, queryKey, following }: { name: string; queryKey: QueryKey; following: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? usersApi.follow(name) : usersApi.unfollow(name)),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<PublicProfile>(queryKey);
      qc.setQueryData<PublicProfile>(queryKey, (old) => (old ? applyFollow(old, next) : old));
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
    },
  });

  const errorText = mutation.isError ? followErrorText(mutation.error, t) : null;

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant={following ? 'ghost' : 'primary'}
        disabled={mutation.isPending}
        onClick={() => {
          mutation.reset();
          mutation.mutate(!following);
        }}
      >
        {following ? t('profile:follow.unfollow') : t('profile:follow.follow')}
      </Button>
      {errorText && (
        <p role="alert" className="text-[0.9rem] text-error">
          {errorText}
        </p>
      )}
    </div>
  );
}

function followErrorText(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError && err.status === 400 && err.message) return err.message;
  return t('profile:follow.error');
}

/** Shown in place of the follow button when signed out. */
export function LoginToFollow({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/login?next=${encodeURIComponent(`/u/${name}`)}`}
      className="text-main underline underline-offset-4"
    >
      {t('profile:follow.loginToFollow')}
    </Link>
  );
}

export function ReportButton({ name }: { name: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" className="px-0 py-0 text-[0.95rem] underline underline-offset-4" onClick={() => setOpen(true)}>
        {t('profile:report.button')}
      </Button>
      {open && <ReportDialog name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Reason (required), optional details (up to 500 characters), then a thank-you or the error. */
export function ReportDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const { t } = useTranslation();
  const groupId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.report(name, {
        reason: reason ?? 'other',
        details: details.trim() === '' ? undefined : details.trim(),
      }),
    onSuccess: () => setDone(true),
  });

  const errorText = mutation.isError ? reportErrorText(mutation.error, t) : null;

  return (
    <Modal open onClose={onClose} title={t('profile:report.title', { name })}>
      {done ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-text">
            {t('profile:report.thanks')}
          </p>
          <div className="flex justify-end">
            {/* The form is gone, so focus moves here: keyboard users can Escape or Enter out. */}
            <Button autoFocus onClick={onClose}>
              {t('profile:report.close')}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason === null || mutation.isPending) return;
            mutation.mutate();
          }}
        >
          <fieldset className="flex flex-col gap-2" aria-labelledby={`${groupId}-legend`}>
            <legend id={`${groupId}-legend`} className="mb-2 text-[0.9rem] text-sub">
              {t('profile:report.reasonLegend')}
            </legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-3 text-text">
                <input
                  type="radio"
                  name={`${groupId}-reason`}
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-main"
                />
                {t(`profile:report.reasons.${r}`)}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${groupId}-details`} className="text-[0.9rem] text-sub">
              {t('profile:report.details')}
            </label>
            <textarea
              id={`${groupId}-details`}
              rows={3}
              maxLength={DETAILS_MAX}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              aria-describedby={`${groupId}-count`}
              className="rounded-[6px] bg-surface px-3 py-2.5 text-text outline-none"
            />
            <p id={`${groupId}-count`} className="tabular text-right text-[0.85rem] text-sub">
              {t('profile:report.detailsCount', { count: details.length })}
            </p>
          </div>

          {errorText && (
            <p role="alert" className="text-error">
              {errorText}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              {t('profile:report.cancel')}
            </Button>
            <Button type="submit" disabled={reason === null || mutation.isPending}>
              {mutation.isPending ? t('profile:report.submitting') : t('profile:report.submit')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** 409: this reporter already has an open report for this user. 429: the throttle. */
function reportErrorText(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError && err.status === 409) return t('profile:report.duplicate');
  if (err instanceof ApiError && err.status === 429) return t('profile:report.tooMany');
  return t('profile:report.error');
}
