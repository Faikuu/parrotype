import { useId, type InputHTMLAttributes } from 'react';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, className, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[0.9rem] text-sub">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded-[6px] bg-surface px-3 py-2.5 text-text outline-none placeholder:text-sub ${className ?? ''}`}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-[0.9rem] text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
