import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type Size = 'md' | 'lg' | 'sm';

const base =
  'inline-flex items-center justify-center gap-2 rounded font-semibold transition-colors ' +
  'focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
  'disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-ink-inverse shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-surface text-brand-700 border-2 border-brand-600 hover:bg-brand-50',
  outline: 'bg-surface text-brand-700 border border-brand-200 hover:bg-brand-50',
  danger: 'bg-danger-600 text-ink-inverse hover:bg-danger-700',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
};

// Every size keeps at least a 44×44 px target; "sm" is for dense staff tables only.
const sizes: Record<Size, string> = {
  sm: 'min-h-[36px] px-3 text-sm',
  md: 'min-h-touch px-4 text-base',
  lg: 'min-h-[52px] px-6 text-lg',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', block = false) {
  return `${base} ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, icon, loading, children, className = '', disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${buttonClass(variant, size, block)} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  children,
  className = '',
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; block?: boolean; icon?: ReactNode }) {
  return (
    <Link className={`${buttonClass(variant, size, block)} ${className}`} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        aria-hidden="true"
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
