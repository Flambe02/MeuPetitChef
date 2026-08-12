import { useRegisterSW } from 'virtual:pwa-register/react';

import { Button } from '@/components/ui/Button';

/**
 * Service-worker update banner.
 *
 * Deliberately a prompt rather than an auto-reload: reloading the page under
 * someone who is on step 6 of 11 with a timer running would be hostile.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => console.error('Service worker registration failed', error),
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-app items-center gap-3 border-t border-hairline bg-graphite-900 px-5 py-4 text-porcelain-100"
    >
      <p className="flex-1 text-small">Uma nova versão está pronta.</p>
      <Button size="sm" variant="accent" onClick={() => void updateServiceWorker(true)}>
        Atualizar
      </Button>
      <Button size="sm" variant="quiet" onClick={() => setNeedRefresh(false)}>
        Agora não
      </Button>
    </div>
  );
}
