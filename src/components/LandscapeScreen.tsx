import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { useLandscapeLock } from '@/hooks/useLandscapeLock';
import { cn } from '@/lib/cn';

/**
 * Full-viewport shell for the two screens the design draws in landscape.
 *
 * The prototype gates its own phone frame on
 * `isPortrait: screen !== "cook" && screen !== "spread"` — those two fill the
 * width. They therefore escape both `<AppShell>` (no tab bar) and its 440px
 * `max-w-app`, which would otherwise reduce a landscape layout to a narrow
 * column with two empty bands.
 *
 * Held upright, they do not degrade — they break. So rather than render a
 * broken screen, this asks for the rotation and says so plainly if the device
 * will not oblige. Everything else in the app stays portrait.
 */
export function LandscapeScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isPortrait } = useLandscapeLock();

  const frame = cn(
    'fixed inset-0 flex flex-col overflow-hidden bg-base text-ink',
    // Held sideways, the unsafe area is on the left and right edges too.
    'pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)]',
    'pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
    className,
  );

  if (isPortrait) {
    return (
      <div className={frame}>
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center gap-5 px-10 text-center"
        >
          <RotateCcw aria-hidden className="size-12 text-rouge" strokeWidth={1.5} />
          <h1 className="font-display text-display-s text-ink">Gire o telefone</h1>
          <p className="max-w-[34ch] text-small leading-[1.6] text-ink-muted">
            O modo cozinha usa a tela deitada: as etapas ficam grandes o bastante para serem lidas a
            um braço de distância, com as mãos ocupadas.
          </p>
        </div>
      </div>
    );
  }

  return <div className={frame}>{children}</div>;
}
