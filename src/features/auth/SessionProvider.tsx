import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearPersistedCache } from '@/lib/query/client';
import { supabase } from '@/lib/supabase/client';

import { SessionContext, type SessionState } from './session-context';

/**
 * Holds the Supabase session and keeps it in sync.
 *
 * `onAuthStateChange` fires on token refresh too, which matters for a PWA that
 * can sit backgrounded on a phone for hours between two recipe steps.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setIsLoading(false);

      // Signing out must take the cached rows with it. The query cache is
      // persisted to IndexedDB, so without this the next account to sign in on
      // this phone reads the previous one's profile and favourites.
      if (event === 'SIGNED_OUT') void clearPersistedCache();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionState>(
    () => ({ session, user: session?.user ?? null, isLoading }),
    [session, isLoading],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
