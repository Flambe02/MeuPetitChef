import { useEffect, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A slide-up panel anchored to the bottom edge, built from tokens rather than
 * a DS class — the Signal Noir prototype styles its own `Dialog` inline and
 * was never mirrored into `signal-noir.css` because nothing used to need it
 * (see that file's own note). Semana's generation sheet, "adicionar
 * refeição" and the "⋯" menu are the first three call sites.
 *
 * Deliberately not a full focus-trap: Escape and a backdrop tap both close
 * it, and the panel itself is where focus lands, which covers a phone screen
 * reasonably well without pulling in a dependency for it.
 */
export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-overlay"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'animate-in safe-bottom relative max-h-[85vh] w-full max-w-app overflow-y-auto',
          'rounded-t-lg border-t border-hairline bg-raised shadow-overlay',
          className,
        )}
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-9 rounded-pill bg-hairline" />
        {title ? (
          <h2 className="px-5 pt-3 pb-1 font-display text-heading font-semibold text-ink">{title}</h2>
        ) : null}
        <div className="px-5 pt-2 pb-6">{children}</div>
      </div>
    </div>
  );
}
