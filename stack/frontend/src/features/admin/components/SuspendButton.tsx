import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { adminApi } from '@/lib/api';
import { errorText } from '../errors';
import { ReasonDialog, REASON_MAX } from './ReasonDialog';
import { Tip } from './Tip';
import { useToast } from './useToast';

/** The suspend action: a button that asks for a reason, then bans the user. */
export function SuspendButton({ userId, name, disabledReason, onDone }: { userId: number; name: string; disabledReason: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (reason: string) => adminApi.ban(userId, reason),
    onSuccess: () => {
      setOpen(false);
      toast(t('admin:toast.suspended'));
      onDone();
    },
  });
  return (
    <>
      <Tip reason={disabledReason}>
        <Button
          variant="ghost"
          disabled={disabledReason !== null}
          onClick={() => {
            mutation.reset();
            setOpen(true);
          }}
        >
          {t('admin:userDetail.suspend.label')}
        </Button>
      </Tip>
      <ReasonDialog
        open={open}
        title={t('admin:userDetail.suspend.title', { name })}
        hint={t('admin:userDetail.suspend.hint', { max: REASON_MAX })}
        submitLabel={t('admin:userDetail.suspend.submit')}
        pending={mutation.isPending}
        error={mutation.error ? errorText(mutation.error, t) : null}
        onCancel={() => setOpen(false)}
        onSubmit={(reason) => mutation.mutate(reason)}
      />
    </>
  );
}
