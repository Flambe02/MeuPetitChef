import { Book, Calendar, House, MoreHorizontal, Search } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { TAB_ROUTES } from '@/app/routes';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n/language-context';

const TAB_ICON = {
  house: House,
  search: Search,
  calendar: Calendar,
  book: Book,
  more: MoreHorizontal,
} as const;

/**
 * The app frame: a phone-width column, a bottom tab bar, and an offline strip.
 *
 * Cook mode renders outside this shell — a guided step must own the whole
 * screen, with no tab bar to fat-finger while stirring.
 */
export function AppShell() {
  const isOnline = useOnlineStatus();
  const location = useLocation();
  const { t } = useLanguage();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-base text-ink">
      {!isOnline ? (
        <div
          role="status"
          className="safe-top bg-graphite-900 px-4 py-2 text-center text-small text-porcelain-100"
        >
          Sem conexão — você continua vendo o que já foi salvo.
        </div>
      ) : null}

      <main className="flex-1 pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))]">
        <Outlet key={location.pathname} />
      </main>

      <nav
        aria-label="Navegação principal"
        className="safe-bottom fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-app justify-around border-t border-hairline bg-raised/95 backdrop-blur"
      >
        {TAB_ROUTES.map((tab) => {
          const Icon = TAB_ICON[tab.icon];
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex h-[var(--tabbar-height)] flex-1 flex-col items-center justify-center gap-1.5',
                  'font-mono text-[9px] tracking-[0.12em] uppercase no-underline',
                  'transition-colors duration-[140ms] ease-signal',
                  // The active tab *is* the frame's single rouge accent.
                  isActive ? 'text-rouge' : 'text-ink-muted',
                )
              }
            >
              <Icon aria-hidden className="size-[22px]" strokeWidth={1.75} />
              <span>{t(tab.labelKey)}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
