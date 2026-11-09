/** A labelled text input with an optional hint. */
export function TextInput({
  id,
  label,
  hint,
  value,
  onChange,
  maxLength,
  autoFocus,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.9rem] text-sub">
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        autoFocus={autoFocus}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-[0.85rem] text-sub">
          {hint}
        </p>
      )}
    </div>
  );
}
