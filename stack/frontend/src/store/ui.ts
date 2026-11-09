import { create } from 'zustand';
import type { ThemeChoice, ThemeTokens } from '@/themes/themes';

/** Element that had focus before the palette or custom text dialog opened. Not reactive. */
let returnFocusTo: HTMLElement | null = null;

function focusedElement(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body && el !== document.documentElement ? el : null;
}

/** Puts focus back where it was before the overlay opened, or on the typing input when that is gone. */
function restoreFocus(): void {
  const target = returnFocusTo;
  returnFocusTo = null;
  if (target?.isConnected) {
    target.focus({ preventScroll: true });
    return;
  }
  document.querySelector<HTMLElement>('[data-typing-input]')?.focus({ preventScroll: true });
}

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

  themeEditorOpen: boolean;
  openThemeEditor: () => void;
  closeThemeEditor: () => void;

  /** Colours being edited in the theme editor, shown live until they are saved or dropped. */
  themeDraft: ThemeTokens | null;
  setThemeDraft: (tokens: ThemeTokens | null) => void;

  isTyping: boolean;
  setTyping: (typing: boolean) => void;

  previewTheme: ThemeChoice | null;
  setPreviewTheme: (id: ThemeChoice | null) => void;

  restartToken: number;
  restart: () => void;
}

export const useUi = create<UiState>()((set, get) => {
  // Only the first overlay in a stack records the element to return focus to
  // (the palette opening the custom text dialog must not overwrite it).
  const overlayOpen = (s: UiState) => s.commandLineOpen || s.customTextOpen || s.themeEditorOpen;
  const captureFocusUnlessOverlaid = () => {
    if (!overlayOpen(get())) returnFocusTo = focusedElement();
  };
  // Focus goes back only once no overlay is left open.
  const restoreFocusIfIdle = () => {
    if (!overlayOpen(get())) restoreFocus();
  };

  return {
    commandLineOpen: false,
    commandLineInitialPath: undefined,
    openCommandLine: (initialPath) => {
      captureFocusUnlessOverlaid();
      set({ commandLineOpen: true, commandLineInitialPath: initialPath });
    },
    closeCommandLine: () => {
      set({ commandLineOpen: false, commandLineInitialPath: undefined });
      restoreFocusIfIdle();
    },

    customTextOpen: false,
    openCustomText: () => {
      captureFocusUnlessOverlaid();
      set({ customTextOpen: true });
    },
    closeCustomText: () => {
      set({ customTextOpen: false });
      restoreFocusIfIdle();
    },

    themeEditorOpen: false,
    openThemeEditor: () => {
      captureFocusUnlessOverlaid();
      set({ themeEditorOpen: true });
    },
    closeThemeEditor: () => {
      set({ themeEditorOpen: false, themeDraft: null });
      restoreFocusIfIdle();
    },

    themeDraft: null,
    setThemeDraft: (tokens) => set({ themeDraft: tokens }),

    isTyping: false,
    setTyping: (typing) => set({ isTyping: typing }),

    previewTheme: null,
    setPreviewTheme: (id) => set({ previewTheme: id }),

    restartToken: 0,
    restart: () => set((s) => ({ restartToken: s.restartToken + 1 })),
  };
});
