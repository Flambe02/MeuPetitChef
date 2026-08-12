import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import { UpdatePrompt } from '@/components/UpdatePrompt';

/**
 * Mounts the app.
 *
 * Split out of `main.tsx` so that everything able to throw while its module is
 * being evaluated — the environment contract in `config/env.ts`, and the
 * Supabase client built from it — sits behind a dynamic import that `main.tsx`
 * can catch. A top-level throw in the entry chunk kills the bundle before React
 * exists, and the only thing left on screen is white.
 */
export function mount(container: HTMLElement): void {
  createRoot(container).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
        <UpdatePrompt />
      </Providers>
    </StrictMode>,
  );
}
