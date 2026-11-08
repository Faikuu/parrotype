import { changePasswordSchema, deleteAccountSchema } from './auth.schemas';

describe('changePasswordSchema', () => {
  const ok = { currentPassword: 'old-password', newPassword: 'new-password' };

  it('accepts a valid change', () => {
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
  });

  it('requires a current password', () => {
    expect(changePasswordSchema.safeParse({ ...ok, currentPassword: '' }).success).toBe(false);
  });

  it('caps the current password at 200 characters', () => {
    expect(changePasswordSchema.safeParse({ ...ok, currentPassword: 'x'.repeat(201) }).success).toBe(false);
  });

  it('counts the new password in bytes, not characters', () => {
    // 7 ASCII bytes is below the 8-byte minimum.
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: 'abcdefg' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: 'abcdefgh' }).success).toBe(true);
    // 'é' is 2 bytes: 36 of them is 72 bytes (ok), 37 is 74 bytes (too long).
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: 'é'.repeat(36) }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: 'é'.repeat(37) }).success).toBe(false);
  });

  it('accepts 72 ASCII bytes and rejects 73', () => {
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: 'a'.repeat(72) }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, newPassword: 'a'.repeat(73) }).success).toBe(false);
  });
});

describe('deleteAccountSchema', () => {
  it('requires a non-empty password of at most 200 characters', () => {
    expect(deleteAccountSchema.safeParse({ password: 'x' }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ password: '' }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: 'x'.repeat(201) }).success).toBe(false);
  });
});
