import { Navigate, Outlet, useLocation } from 'react-router';

import { routes } from '@/app/routes';
import { Spinner } from '@/components/ui/states';
import { useIsAdmin } from '@/features/admin/hooks';
import { useSession } from '@/features/auth/session-context';
import { useProfile } from '@/features/profile/hooks';

/** Everything behind the shell requires a session. */
export function RequireAuth() {
  const { session, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) return <Spinner label="Entrando…" />;
  if (!session) {
    return <Navigate to={routes.signIn} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/**
 * Sends first-time users through onboarding. Runs *inside* RequireAuth, so the
 * profile row is guaranteed to exist by the time this renders.
 */
export function RequireOnboarding() {
  const profile = useProfile();

  if (profile.isPending) return <Spinner />;
  // A failed profile read should not lock the user out of the whole app.
  if (profile.isError) return <Outlet />;
  if (profile.data && !profile.data.onboarding_completed_at) {
    return <Navigate to={routes.onboarding} replace />;
  }
  return <Outlet />;
}

/**
 * Gates the back-office. Convenience only — every table and Edge Function the
 * screens behind this touch re-checks `is_admin()` on its own, so this is
 * about not showing an admin console to someone who cannot use it, not about
 * stopping them from reaching it. See `features/admin/hooks.ts`.
 */
export function RequireAdmin() {
  const isAdmin = useIsAdmin();

  if (isAdmin === undefined) return <Spinner />;
  if (!isAdmin) return <Navigate to={routes.more} replace />;
  return <Outlet />;
}
