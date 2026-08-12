import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ChefMode } from '@/domain/types';
import { keys } from '@/lib/query/keys';

import { addRecipeToList } from './api';

/**
 * Pushes a recipe's ingredients onto the open shopping list.
 *
 * The merging and the pantry-skipping happen in `add_recipe_to_shopping_list`,
 * so the phone never downloads a full ingredient list just to diff it — and the
 * list is created on the server if the user has none yet.
 */
export function useAddRecipeToList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { recipeId: string; servings?: number; mode?: ChefMode }) =>
      addRecipeToList(input.recipeId, input.servings, input.mode),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.shopping.all }),
  });
}
