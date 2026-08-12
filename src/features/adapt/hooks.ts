import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session-context';
import { keys } from '@/lib/query/keys';

import { adaptRecipe, type AdaptationOutcome } from './api';

/**
 * "Adaptar para o Brasil".
 *
 * Not optimistic: the rewrite can be refused by its own verification, and
 * showing a Portuguese title that then snaps back to French would be worse
 * than a two-second wait.
 */
export function useAdaptRecipe() {
  const { user } = useSession();
  const client = useQueryClient();

  return useMutation<AdaptationOutcome, Error, string>({
    mutationFn: (recipeId: string) => adaptRecipe(recipeId, user?.id ?? null),
    onSuccess: async () => {
      // The title, the ingredients and the search vector all changed.
      await client.invalidateQueries({ queryKey: keys.recipes.all });
    },
  });
}
