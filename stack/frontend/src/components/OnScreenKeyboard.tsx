import { memo, useMemo } from 'react';
import { cn } from '@/components/cn';
import type { LayoutId } from '@/lib/text/layouts';
import type { KeyboardHints } from '@/store/settings';
import { FINGER_COLOUR, FINGER_OF, KEY_ROWS, keyForChar, legendOf, shiftKeyFor, type KeyDef } from './keyboardLayout';

export interface OnScreenKeyboardProps {
  /** The layout whose legends the keys show (the same physical keys for every layout). */
  layout: LayoutId;
  /** The character the user types next (' ' for a space, '\n' for Enter), or null when there is none. */
  next: string | null;
  /** off: no highlight. next: the next key in --main. fingers: the next key, and the finger colours on every key. */
  hints: KeyboardHints;
}

const KEY_HEIGHT = 'h-[2.1rem]';

/**
 * A drawn ANSI keyboard for the typing test and the lessons. It is decorative: the typing input is elsewhere, so
 * it is aria-hidden. It is hidden below 640px, where there is no room for it.
 */
export const OnScreenKeyboard = memo(function OnScreenKeyboard({ layout, next, hints }: OnScreenKeyboardProps) {
  const target = useMemo(() => (next === null || hints === 'off' ? null : keyForChar(layout, next)), [layout, next, hints]);
  const highlighted = useMemo(() => {
    if (target === null) return new Set<string>();
    const codes = new Set<string>([target.code]);
    if (target.shift) codes.add(shiftKeyFor(target.code));
    return codes;
  }, [target]);

  return (
    <div
      aria-hidden="true"
      data-keyboard-hints={hints}
      className="hidden select-none flex-col gap-1.5 rounded-[10px] bg-surface/40 p-3 sm:flex"
    >
      {KEY_ROWS.map((keys, r) => (
        <div key={r} className="flex gap-1.5">
          {keys.map((def) => (
            <Key
              key={def.code}
              def={def}
              legend={legendOf(layout, def)}
              lit={highlighted.has(def.code)}
              finger={hints === 'fingers' ? FINGER_OF.get(def.code) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
});

const Key = memo(function Key({
  def,
  legend,
  lit,
  finger,
}: {
  def: KeyDef;
  legend: string;
  lit: boolean;
  finger: keyof typeof FINGER_COLOUR | undefined;
}) {
  const tint = finger !== undefined && !lit ? FINGER_COLOUR[finger] : undefined;
  return (
    <span
      data-key={def.code}
      data-lit={lit ? '' : undefined}
      style={{ flexGrow: def.width, flexBasis: 0, ...(tint ? { background: tint } : {}) }}
      className={cn(
        'grid min-w-0 place-items-center rounded-[6px] text-[0.8rem] transition-colors duration-100',
        KEY_HEIGHT,
        lit ? 'bg-main text-bg' : tint ? 'text-text' : 'bg-bg/60 text-sub',
      )}
    >
      {legend}
    </span>
  );
});
