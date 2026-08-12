import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Shows a back affordance. Off on tab roots, on everywhere else. */
  showBack?: boolean;
  action?: ReactNode;
}

export function ScreenHeader({ title, subtitle, showBack = false, action }: ScreenHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="safe-top flex items-start gap-3 px-5 pt-5 pb-4">
      {showBack ? (
        <button
          type="button"
          onClick={() => void navigate(-1)}
          aria-label="Voltar"
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg border border-hairline text-ink"
        >
          <span aria-hidden>←</span>
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-display-s text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-small text-ink-muted">{subtitle}</p> : null}
      </div>

      {action}
    </header>
  );
}
