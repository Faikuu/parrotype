import type { ReactNode } from 'react';

/** A row of filters above a table. It wraps on narrow screens. */
export function Toolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} className="flex flex-wrap items-end gap-3">
      {children}
    </div>
  );
}

/** A labelled native select for filters. */
export function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  disabled,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  /** Background override, e.g. bg-bg inside a dialog whose own background is --surface. */
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.85rem] text-sub">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 min-w-[9rem] rounded-[6px] px-2.5 text-[0.95rem] text-text outline-none disabled:opacity-50 ${className ?? 'bg-surface'}`}
      >
        {children}
      </select>
    </div>
  );
}
