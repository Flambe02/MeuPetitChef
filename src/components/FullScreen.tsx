import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Full-viewport shell for the screens that escape `<AppShell>`.
 *
 * Cook mode and the recipe spread fill the display: no tab bar, and none of the
 * 440px `max-w-app` that would reduce a landscape layout to a narrow column
 * between two empty bands.
 *
 * This used to be `<LandscapeScreen>`, and it used to refuse portrait outright
 * with a "turn your phone" wall. Both orientations are drawn now — see
 * `useCookOrientation` — so the shell no longer has an opinion about which way
 * the device is held. It only reserves the unsafe edges, which in landscape are
 * the left and right ones too.
 */
export function FullScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'fixed inset-0 flex flex-col overflow-hidden bg-base text-ink',
        'pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)]',
        'pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
