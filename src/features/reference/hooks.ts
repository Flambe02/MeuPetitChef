import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session-context';
import { keys } from '@/lib/query/keys';

import {
  createVersionFromImport,
  type OwnVersionOutcome,
  type VersionFromImportInput,
} from './api';

/**
 * "Cozinhar agora" — the chef writes the recipe straight from what was just
 * imported, without waiting for it to be saved as a reference first.
 *
 * Takes a couple of seconds — a whole recipe is being written — so nothing
 * about this is optimistic.
 */
export function useVersionFromImport() {
  const { user } = useSession();
  const client = useQueryClient();

  return useMutation<OwnVersionOutcome, Error, VersionFromImportInput>({
    mutationFn: (input) => createVersionFromImport(user!.id, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.recipes.all });
      // It lands in the book on the way out, so the book's counts are stale.
      await client.invalidateQueries({ queryKey: keys.favorites.all });
    },
  });
}
