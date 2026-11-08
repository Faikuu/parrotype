import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';

/** Sets the custom text, switches to custom mode and restarts. Mounted once in Layout. */
export function CustomTextModal() {
  const open = useUi((s) => s.customTextOpen);
  if (!open) return null;
  return <CustomTextForm />;
}

function CustomTextForm() {
  const { t } = useTranslation();
  const [text, setText] = useState(() => useSettings.getState().customText);
  const [error, setError] = useState<string | undefined>();
  const close = () => useUi.getState().closeCustomText();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError(t('commands:customTextEmpty'));
      return;
    }
    useSettings.getState().setMany({ customText: trimmed, mode: 'custom' });
    useUi.getState().restart();
    close();
  }

  return (
    <Modal open onClose={close} title={t('commands:customTextTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <p className="text-[0.9rem] text-sub">{t('commands:customTextDescription')}</p>
        <label htmlFor="custom-text" className="text-[0.9rem] text-sub">
          {t('commands:customTextLabel')}
        </label>
        <textarea
          id="custom-text"
          data-autofocus
          rows={6}
          value={text}
          placeholder={t('commands:customTextPlaceholder')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'custom-text-error' : undefined}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(undefined);
          }}
          className="w-full resize-y rounded-[6px] bg-bg p-3 text-text outline-none placeholder:text-sub [font-family:var(--font-test)]"
        />
        {error ? (
          <p id="custom-text-error" className="text-[0.9rem] text-error">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t('common:cancel')}
          </Button>
          <Button type="submit">{t('commands:customTextUse')}</Button>
        </div>
      </form>
    </Modal>
  );
}
