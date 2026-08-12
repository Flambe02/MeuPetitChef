import type { Session, User } from '@supabase/supabase-js';
import { createContext, use } from 'react';

export interface SessionState {
  session: Session | null;
  user: User | null;
  /** True until the first auth check resolves — do not redirect before then. */
  isLoading: boolean;
}

// Split from SessionProvider.tsx so that file exports only a component and
// Fast Refresh keeps working across edits.
export const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const context = use(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
