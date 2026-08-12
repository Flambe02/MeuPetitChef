import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The prototype only ever uses `outline`; the others come from the DS. */
  variant?: 'plain' | 'outline' | 'signal';
  size?: 'sm' | 'md';
  /** Required — an icon-only control is unusable without one. */
  'aria-label': string;
  children: ReactNode;
}

/**
 * `sn-iconbtn`. Square, icon-only, 38px (30px at `sm`).
 *
 * Note the DS control is below the 44px touch target the brand's own spacing
 * guideline sets, so anything placed in a thumb zone should be given extra hit
 * area by its container rather than by growing the button.
 */
export function IconButton({
  variant = 'plain',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn('sn-iconbtn', className)}
      data-variant={variant === 'plain' ? undefined : variant}
      data-size={size === 'md' ? undefined : size}
      {...rest}
    >
      {children}
    </button>
  );
}
