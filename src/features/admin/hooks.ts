import { useProfile } from '@/features/profile/hooks';

/**
 * Whether the signed-in user may see the admin back-office.
 *
 * This is UX only — it decides what a screen renders, nothing more. The
 * actual gate is server-side: every `magazine_*` table's RLS policy checks
 * `is_admin()` again, and `magazine-vision`'s `authorize()` checks it a third
 * time before spending a token. Hiding a button here is convenience, not
 * security, and none of this file's callers should mistake it for the latter.
 *
 * `undefined` while the profile is still loading, so a caller can tell
 * "not admin" apart from "don't know yet" — showing a 403 flash for the split
 * second before the profile arrives would be its own small bug.
 */
export function useIsAdmin(): boolean | undefined {
  const profile = useProfile();
  if (profile.isPending) return undefined;
  return profile.data?.role === 'admin';
}
