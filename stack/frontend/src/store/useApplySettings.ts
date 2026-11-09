import { useEffect } from 'react';
import i18n from '@/i18n';
import { applyTestFont, applyTheme, resolveTheme } from '@/themes/themes';
import { useSettings } from './settings';
import { useUi } from './ui';

/** Applies theme, test font and language to the document. Call once from the app root. */
export function useApplySettings(): void {
  const theme = useSettings((s) => s.theme);
  const customTheme = useSettings((s) => s.customTheme);
  const font = useSettings((s) => s.font);
  const fontSize = useSettings((s) => s.fontSize);
  const uiLanguage = useSettings((s) => s.uiLanguage);
  const previewTheme = useUi((s) => s.previewTheme);
  const draft = useUi((s) => s.themeDraft);

  useEffect(() => {
    // The editor's draft wins over the palette preview; both fall back to the saved theme.
    applyTheme(draft ? resolveTheme('custom', draft) : resolveTheme(previewTheme ?? theme, customTheme));
  }, [draft, previewTheme, theme, customTheme]);

  useEffect(() => {
    applyTestFont(font, fontSize);
  }, [font, fontSize]);

  useEffect(() => {
    document.documentElement.lang = uiLanguage;
    void i18n.changeLanguage(uiLanguage);
  }, [uiLanguage]);
}
