import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';

/**
 * One query client for the app.
 *
 * The defaults are tuned for a kitchen, not a dashboard: recipes barely change,
 * so cache them long and do not refetch when the user tabs away mid-recipe and
 * comes back.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Auth and RLS failures will not fix themselves on retry.
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * IndexedDB persistence — this is what makes favourites and the recipe you are
 * halfway through readable with no connection. localStorage is deliberately
 * avoided: it is synchronous and far too small for a recipe cache.
 */
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((value) => value ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'mpc.query-cache',
  throttleTime: 1000,
});

/** Bump when the cached shape changes, to discard stale entries on deploy. */
export const PERSIST_BUSTER = 'v1';

/**
 * Wipes every cached row on sign-out — both in memory and in IndexedDB.
 *
 * Without this, the next person to sign in on the same phone reads the previous
 * account's profile and favourites straight out of the persisted cache, for the
 * whole `staleTime` and across reloads. Scoping the keys by user id (see
 * `keys.ts`) makes a collision impossible; this makes the data unreachable.
 */
export async function clearPersistedCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
