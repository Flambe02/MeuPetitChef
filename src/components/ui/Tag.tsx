import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * `sn-tag` — a pill. Renders as a `<button>` when it can be toggled or removed,
 * as a `<span>` when it is only a label, which is how the prototype uses both.
 */
interface TagProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  active?: boolean;
  /** Adds the `x` affordance. The handler receives no event — it is a remove. */
  onRemove?: () => void;
  removeLabel?: string;
  children: ReactNode;
}

export function Tag({
  active = false,
  onRemove,
  removeLabel,
  onClick,
  className,
  type = 'button',
  children,
  ...rest
}: TagProps) {
  const interactive = Boolean(onClick);
  const body = (
    <>
      {children}
      {onRemove ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={removeLabel ?? `Remover ${typeof children === 'string' ? children : 'item'}`}
          className="sn-tag__x"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </span>
      ) : null}
    </>
  );

  if (!interactive) {
    return (
      <span className={cn('sn-tag', className)} data-active={active || undefined}>
        {body}
      </span>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={active}
      className={cn('sn-tag', className)}
      data-active={active || undefined}
      {...rest}
    >
      {body}
    </button>
  );
}
