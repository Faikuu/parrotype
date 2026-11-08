import { useEffect } from 'react';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';

/** Registers the global shortcuts that open the command line. Mount once (in Layout). */
export function useCommandLineShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if ((mod && e.shiftKey && key === 'p') || (mod && !e.shiftKey && !e.altKey && key === 'k')) {
        e.preventDefault();
        useUi.getState().openCommandLine();
        return;
      }

      if (e.key === 'Escape' && !mod && !e.shiftKey && !e.altKey) {
        if (useSettings.getState().quickRestart === 'esc') return;
        const ui = useUi.getState();
        if (ui.commandLineOpen || ui.customTextOpen) return;
        if (document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        ui.openCommandLine();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
