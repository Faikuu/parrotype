import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { useSettings } from '@/store/settings';
import { markHighContrastDismissed, shouldSuggestHighContrast } from './highContrastPrompt';

/** A one-time, dismissible suggestion of the high-contrast theme for people whose system asks for more contrast. */
export function HighContrastSuggestion() {
  const { t } = useTranslation();
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const [open, setOpen] = useState(() => shouldSuggestHighContrast(theme));
  if (!open) return null;

  const dismiss = () => {
    markHighContrastDismissed();
    setOpen(false);
  };

  return (
    <section
      aria-labelledby="hc-suggestion-title"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-[28rem] flex-col gap-3 rounded-[10px] bg-surface p-4 text-text shadow-none"
    >
      <h2 id="hc-suggestion-title" className="m-0 text-[1rem] font-semibold">
        {t('a11y:highContrastTitle')}
      </h2>
      <p className="m-0 text-[0.9rem] text-sub">{t('a11y:highContrastBody')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            set('theme', 'high-contrast');
            dismiss();
          }}
        >
          {t('a11y:useHighContrast')}
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          {t('a11y:dismissToast')}
        </Button>
      </div>
    </section>
  );
}
