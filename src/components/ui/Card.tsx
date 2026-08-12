import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Pillar = 'conversation' | 'music' | 'finance';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /**
   * Paints the 2px pillar rule across the top edge. `finance` is the rouge one —
   * the only pillar this product uses, and the only accent allowed per frame.
   */
  pillar?: Pillar;
  /** Kept as an alias for `pillar="finance"`, which is what it always meant. */
  accent?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

/** `sn-card`. The rule sits on the top edge, not the left — see the DS. */
export function Card({
  children,
  pillar,
  accent = false,
  padding = 'md',
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn('sn-card', className)}
      data-pillar={pillar ?? (accent ? 'finance' : undefined)}
      data-padding={padding === 'md' ? undefined : padding}
      {...rest}
    >
      {children}
    </div>
  );
}

/** `sn-card__eyebrow` — takes the pillar colour when the card has one. */
export function CardEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('sn-card__eyebrow', className)}>{children}</span>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('sn-card__title', className)}>{children}</h2>;
}

/**
 * `sn-datalabel` — mono, uppercase, 0.16em. The system's connective tissue.
 *
 * `value` renders the second half of a label/value pair, which is how the DS
 * intends the baseline-aligned flex row to be used.
 */
export function DataLabel({
  children,
  value,
  tone,
  className,
}: {
  children: ReactNode;
  value?: ReactNode;
  tone?: 'primary' | 'signal' | 'conversation' | 'music';
  className?: string;
}) {
  return (
    <span className={cn('sn-datalabel', className)} data-tone={tone}>
      {children}
      {value !== undefined ? <span className="sn-datalabel__value">{value}</span> : null}
    </span>
  );
}
