import type { StateStorage } from 'zustand/middleware';

/**
 * localStorage behind try/catch: private windows, blocked storage and quota errors must not break
 * the app. Values that can't be read or written just don't persist.
 */
export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // storage unavailable: the value just won't persist
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};
