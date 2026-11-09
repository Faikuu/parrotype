import {
  validateEmail,
  validateLoginPassword,
  validateName,
  validateNewPassword,
} from './validation';

describe('auth validation', () => {
  it('checks usernames against the server pattern', () => {
    expect(validateName('kea_1')).toBeUndefined();
    expect(validateName('ab')).toBe('nameInvalid');
    expect(validateName('a'.repeat(21))).toBe('nameInvalid');
    expect(validateName('has space')).toBe('nameInvalid');
    expect(validateName('zażółć')).toBe('nameInvalid');
  });

  it('checks emails', () => {
    expect(validateEmail('me@example.com')).toBeUndefined();
    expect(validateEmail('  me@example.com ')).toBeUndefined();
    expect(validateEmail('')).toBe('emailRequired');
    expect(validateEmail('me@example')).toBe('emailInvalid');
    expect(validateEmail('me example@x.com')).toBe('emailInvalid');
    expect(validateEmail(`${'a'.repeat(250)}@x.co`)).toBe('emailInvalid');
  });

  it('checks new passwords between 8 and 72 chars', () => {
    expect(validateNewPassword('1234567')).toBe('passwordShort');
    expect(validateNewPassword('12345678')).toBeUndefined();
    expect(validateNewPassword('x'.repeat(72))).toBeUndefined();
    expect(validateNewPassword('x'.repeat(73))).toBe('passwordLong');
  });

  it('limits new passwords to 72 bytes, not characters', () => {
    // 'ż' is two bytes in UTF-8: 40 of them are 40 characters but 80 bytes.
    expect(validateNewPassword('ż'.repeat(40))).toBe('passwordLong');
    expect(validateNewPassword('ż'.repeat(36))).toBeUndefined();
  });

  it('only requires a login password to be present', () => {
    expect(validateLoginPassword('')).toBe('passwordRequired');
    expect(validateLoginPassword('a')).toBeUndefined();
  });
});
