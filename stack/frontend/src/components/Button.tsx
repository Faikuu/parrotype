import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** React 19: ref is an ordinary prop on function components. */
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-main text-bg hover:opacity-90',
  ghost: 'bg-transparent text-sub hover:text-text',
};

export function Button({ variant = 'primary', className, type = 'button', ref, ...rest }: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[6px] px-4 py-2 text-[0.95rem] font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
