import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';

import { Button } from '@/components/ui/Button';

/** Route-level error element. Keeps a broken screen from blanking the whole app. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  const message = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Erro inesperado.';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="font-display text-display-s text-ink">Algo quebrou aqui</h1>
      <p className="max-w-[40ch] text-small text-ink-muted">{message}</p>
      <Button onClick={() => void navigate('/', { replace: true })}>Voltar ao início</Button>
    </div>
  );
}
