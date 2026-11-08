// Mirrors the backend rules (docs/SPEC.md section 1). Each validator returns an i18n key
// under `auth:errors`, or undefined when the value is fine.

export const NAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const EMAIL_MAX = 254;

export type ErrorKey = string;

export function validateName(value: string): ErrorKey | undefined {
  return NAME_RE.test(value) ? undefined : 'nameInvalid';
}

export function validateEmail(value: string): ErrorKey | undefined {
  const v = value.trim();
  if (!v) return 'emailRequired';
  if (v.length > EMAIL_MAX || !EMAIL_RE.test(v)) return 'emailInvalid';
  return undefined;
}

const encoder = new TextEncoder();

export function validateNewPassword(value: string): ErrorKey | undefined {
  if (value.length < PASSWORD_MIN) return 'passwordShort';
  // The server limit is in bytes (UTF-8), not characters.
  if (encoder.encode(value).length > PASSWORD_MAX) return 'passwordLong';
  return undefined;
}

export function validateLoginPassword(value: string): ErrorKey | undefined {
  return value.length === 0 ? 'passwordRequired' : undefined;
}
