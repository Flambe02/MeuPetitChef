import { createContext, use } from 'react';

import type { TranslationKey } from './pt';

export type UiLanguage = 'pt' | 'fr';

export interface LanguageContextValue {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  /** `{name}`-style placeholders in the string are replaced from `vars`. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

// Split from LanguageProvider.tsx so that file exports only a component and
// Fast Refresh keeps working across edits — the same reason session-context.ts
// is separate from SessionProvider.tsx.
export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const context = use(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return context;
}
