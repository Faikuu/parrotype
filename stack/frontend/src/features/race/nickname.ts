/** Guest nicknames: the same rule as the server (GUEST_NAME_REGEX), checked on the trimmed value. */
export const NICKNAME_PATTERN = /^[a-zA-Z0-9_ ]{2,20}$/;
const STORAGE_KEY = 'parrotype:nickname';

export function isValidNickname(value: string): boolean {
  return NICKNAME_PATTERN.test(value.trim());
}

/** The last nickname used on this device, or ''. Storage can throw (private mode, blocked site data). */
export function readRememberedNickname(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberNickname(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Not remembered; the page still works.
  }
}
