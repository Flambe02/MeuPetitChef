import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session-context';
import { keys } from '@/lib/query/keys';

import { createOwnVersion, type OwnVersionInput, type OwnVersionOutcome } from './api';

/**
 * "Criar minha versão".
 *
 * Takes a couple of seconds — the chef is writing a whole recipe — so nothing
 * about this is optimistic.
 */
export function useCreateOwnVersion() {
  const { user } = useSession();
  const client = useQueryClient();

  return useMutation<OwnVersionOutcome, Error, OwnVersionInput>({
    mutationFn: (input) => createOwnVersion(user!.id, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.recipes.all });
    },
  });
}
