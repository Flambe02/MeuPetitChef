import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** `sn-badge` — mono, uppercase, hairline box. Optionally led by a status dot. */
export function Badge({
  tone,
  dot = false,
  className,
  children,
}: {
  tone?: 'signal' | 'conversation' | 'music' | 'solid';
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('sn-badge', className)} data-tone={tone}>
      {dot ? <span aria-hidden className="sn-badge__dot" /> : null}
      {children}
    </span>
  );
}
