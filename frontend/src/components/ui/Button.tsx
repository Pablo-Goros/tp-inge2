import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const cls: Record<ButtonVariant, string> = { primary: 'btn btn-p', secondary: 'btn btn-s', ghost: 'btn btn-g' };

interface Common {
  variant?: ButtonVariant;
  block?: boolean;
  small?: boolean;
}

function classes(c: Common, extra?: string) {
  return [cls[c.variant ?? 'primary'], c.block && 'btn-block', c.small && 'btn-sm', extra].filter(Boolean).join(' ');
}

interface ButtonProps extends Common, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingLabel?: ReactNode;
}

export function Button({ variant, block, small, loading, loadingLabel, children, className, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classes({ variant, block, small }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="spin" aria-hidden="true" />}
      {loading ? (loadingLabel ?? children) : children}
    </button>
  );
}

export function LinkButton({ variant, block, small, className, ...rest }: Common & LinkProps) {
  return <Link {...rest} className={classes({ variant, block, small }, className)} />;
}
