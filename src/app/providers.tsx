import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';

import { SessionProvider } from '@/features/auth/SessionProvider';
import { LanguageProvider } from '@/lib/i18n/LanguageProvider';
import { persister, PERSIST_BUSTER, queryClient } from '@/lib/query/client';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: PERSIST_BUSTER,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          // Only successful reads are worth restoring offline. Persisting a
          // failed query would resurrect an error screen with no network.
          shouldDehydrateQuery: (query) => query.state.status === 'success',
        },
      }}
    >
      <SessionProvider>
        <LanguageProvider>{children}</LanguageProvider>
      </SessionProvider>
    </PersistQueryClientProvider>
  );
}
