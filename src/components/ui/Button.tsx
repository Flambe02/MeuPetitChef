import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'accent' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Stretches to the container — the default for a stacked mobile form. */
  block?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // Signal Noir on porcelain: the primary action is graphite, not the accent.
  primary: 'bg-graphite-900 text-porcelain-100 border border-transparent hover:bg-graphite-700',
  accent: 'bg-rouge text-porcelain-100 border border-transparent hover:bg-rouge-hover',
  ghost: 'bg-transparent text-ink border border-strong hover:bg-inset',
  quiet: 'bg-transparent text-ink-muted border border-transparent hover:text-ink',
};

const SIZES: Record<Size, string> = {
  sm: 'h-[38px] px-4 text-small',
  md: 'h-[46px] px-5 text-body',
  lg: 'h-[50px] px-6 text-body',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  block = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
        'transition-[background-color,border-color,color,box-shadow] duration-[140ms]',
        'ease-signal disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
