import { useId, type ReactNode } from 'react';
import { cn } from '@/components/cn';
import type { CellState } from '../permissionModel';

/**
 * One permission checkbox. A locked cell keeps its reason as the tooltip (on the label, which still
 * receives pointer events) and as the accessible description.
 */
export function PermissionCell({
  state,
  label,
  reason,
  onToggle,
  className,
  children,
}: {
  state: CellState;
  label: string;
  reason: string | null;
  onToggle: (on: boolean) => void;
  className?: string;
  /** Visible text shown beside the box, inside the same label. */
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <label
      title={state.disabled && reason ? reason : undefined}
      className={cn(
        'inline-flex cursor-pointer items-center rounded-[6px]',
        state.disabled && 'cursor-not-allowed',
        className,
      )}
    >
      <input
        type="checkbox"
        className="size-4 accent-main disabled:opacity-40"
        checked={state.checked}
        disabled={state.disabled}
        aria-label={label}
        aria-describedby={state.disabled && reason ? id : undefined}
        onChange={(e) => onToggle(e.target.checked)}
      />
      {children}
      {state.disabled && reason && (
        <span id={id} className="sr-only">
          {reason}
        </span>
      )}
    </label>
  );
}
