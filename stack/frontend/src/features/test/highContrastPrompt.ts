/** localStorage key for "don't suggest high contrast again". */
export const HC_DISMISS_KEY = 'parrotype:hc-suggestion-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(HC_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHighContrastDismissed(): void {
  try {
    window.localStorage.setItem(HC_DISMISS_KEY, '1');
  } catch {
    // Storage is blocked: the suggestion can come back next visit, which is harmless.
  }
}

/** True when the system asks for more contrast, the suggestion was not dismissed, and the theme is not already high contrast. */
export function shouldSuggestHighContrast(theme: string): boolean {
  if (theme === 'high-contrast' || readDismissed()) return false;
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-contrast: more)').matches;
  } catch {
    return false;
  }
}
