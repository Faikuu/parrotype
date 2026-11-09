import { ApiError } from '@/lib/api';

/**
 * The text to show for a failed write. The server's message is used when there is one, because it
 * says why (for example "You can't manage a user with permissions you don't have"). A 409 means the
 * change was already made; anything else gets a generic line.
 */
export function errorText(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.message) return err.message;
    if (err.status === 0) return t('common:networkError');
    if (err.status === 403 || err.status === 400) return err.message || t('admin:errors.action');
    if (err.message) return err.message;
  }
  return t('admin:errors.action');
}

/** The message for a failed read. */
export function loadErrorText(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError && err.status === 0) return t('common:networkError');
  return t('admin:errors.load');
}
