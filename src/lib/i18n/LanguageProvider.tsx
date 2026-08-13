import { useMemo, useState, type ReactNode } from 'react';

import { useSession } from '@/features/auth/session-context';
import { useProfile, useUpdateProfile } from '@/features/profile/hooks';

import { LanguageContext, type LanguageContextValue, type UiLanguage } from './language-context';
import { fr } from './fr';
import { pt, type TranslationKey } from './pt';

const STORAGE_KEY = 'mpc.language';
const DICTIONARIES: Record<UiLanguage, Record<TranslationKey, string>> = { pt, fr };

function readStoredLanguage(): UiLanguage | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'fr' || stored === 'pt' ? stored : null;
}

/**
 * The app's own bilingual UI — no Google Translate, no widget rewriting the
 * DOM out from under React, no banner to fight. `setLanguage` is a state
 * update, not a reload: the whole tree re-renders in the new language
 * immediately.
 *
 * Signed-in users get their choice carried on `profiles.locale` (a column
 * that already existed and had no reader or writer anywhere in the app), so
 * it follows them to a new device. A local, unauthenticated choice — during
 * onboarding, or on a first visit — lives in `localStorage` only, and is
 * adopted onto the profile the moment one exists, but never fought once a
 * choice has been made locally on this device.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();

  const [language, setLanguageState] = useState<UiLanguage>(() => readStoredLanguage() ?? 'pt');
  const [hasLocalPreference, setHasLocalPreference] = useState(() => readStoredLanguage() !== null);
  // The last profile locale already adopted, so the render-time check below
  // runs at most once per distinct value instead of on every render.
  const [adoptedLocale, setAdoptedLocale] = useState<string | null | undefined>(undefined);

  // Adopts the profile's own locale exactly once, only when this device has
  // no local choice yet — a returning signed-in user sees their own language
  // without having to set it again; a local toggle, once made, is never
  // silently overridden by a stale or differing profile value afterward.
  // Adjusted during render rather than in an effect (React's own pattern for
  // "reset state when a prop/query result changes"): the profile query
  // result *is* the external state being synchronized from, so there is no
  // reason to wait an extra commit to react to it. No refs involved — every
  // value read or written here is plain state, safe under concurrent
  // rendering.
  if (!hasLocalPreference && profile.data?.locale && profile.data.locale !== adoptedLocale) {
    setHasLocalPreference(true);
    setAdoptedLocale(profile.data.locale);
    setLanguageState(profile.data.locale.toLowerCase().startsWith('fr') ? 'fr' : 'pt');
  }

  const value = useMemo<LanguageContextValue>(() => {
    const setLanguage = (next: UiLanguage) => {
      setHasLocalPreference(true);
      setLanguageState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      if (user) updateProfile.mutate({ locale: next === 'fr' ? 'fr-FR' : 'pt-BR' });
    };

    const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const template = DICTIONARIES[language][key];
      if (!vars) return template;
      return Object.entries(vars).reduce(
        (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
        template,
      );
    };

    return { language, setLanguage, t };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateProfile.mutate is a stable TanStack Query reference
  }, [language, user]);

  return <LanguageContext value={value}>{children}</LanguageContext>;
}
