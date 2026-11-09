import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidNickname, readRememberedNickname, rememberNickname } from './nickname';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('isValidNickname', () => {
  it.each([
    ['Ann', true],
    ['ab', true],
    ['player_1 two', true],
    ['a'.repeat(20), true],
    ['  Ann  ', true],
    ['a', false],
    ['', false],
    ['   ', false],
    ['a'.repeat(21), false],
    ['zoë', false],
    ['bad-name', false],
    ['<img>', false],
  ])('%j -> %s', (value, ok) => {
    expect(isValidNickname(value)).toBe(ok);
  });
});

describe('remembered nickname', () => {
  it('stores and reads the nickname under parrotype:nickname', () => {
    rememberNickname('Ann');
    expect(localStorage.getItem('parrotype:nickname')).toBe('Ann');
    expect(readRememberedNickname()).toBe('Ann');
  });

  it('works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readRememberedNickname()).toBe('');
    expect(() => rememberNickname('Ann')).not.toThrow();
  });
});
