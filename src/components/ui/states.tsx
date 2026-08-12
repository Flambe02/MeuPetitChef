import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-muted" role="status">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-pill border-2 border-hairline border-t-rouge"
      />
      <span className="text-small">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <h2 className="font-sans text-heading font-semibold text-ink">{title}</h2>
      {description ? <p className="max-w-[36ch] text-small text-ink-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Algo deu errado.';
  return (
    <EmptyState
      title="Não deu certo"
      description={message}
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-small font-semibold text-rouge underline underline-offset-4"
          >
            Tentar de novo
          </button>
        ) : null
      }
    />
  );
}
