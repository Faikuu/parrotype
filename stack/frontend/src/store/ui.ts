import { create } from 'zustand';
import type { ThemeId } from '@/themes/themes';

/** Transient UI state (not persisted). */
export interface UiState {
  commandLineOpen: boolean;
  /** Command path to open at, ids joined with '/', e.g. 'theme'. */
  commandLineInitialPath: string | undefined;
  openCommandLine: (initialPath?: string) => void;
  closeCommandLine: () => void;

  customTextOpen: boolean;
  openCustomText: () => void;
  closeCustomText: () => void;

  isTyping: boolean;
  setTyping: (typing: boolean) => void;

  previewTheme: ThemeId | null;
  setPreviewTheme: (id: ThemeId | null) => void;

  restartToken: number;
  restart: () => void;
}

export const useUi = create<UiState>()((set) => ({
  commandLineOpen: false,
  commandLineInitialPath: undefined,
  openCommandLine: (initialPath) =>
    set({ commandLineOpen: true, commandLineInitialPath: initialPath }),
  closeCommandLine: () => set({ commandLineOpen: false, commandLineInitialPath: undefined }),

  customTextOpen: false,
  openCustomText: () => set({ customTextOpen: true }),
  closeCustomText: () => set({ customTextOpen: false }),

  isTyping: false,
  setTyping: (typing) => set({ isTyping: typing }),

  previewTheme: null,
  setPreviewTheme: (id) => set({ previewTheme: id }),

  restartToken: 0,
  restart: () => set((s) => ({ restartToken: s.restartToken + 1 })),
}));
