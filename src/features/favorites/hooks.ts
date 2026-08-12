import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session-context';
import type { RecipeCard } from '@/domain/types';
import { keys } from '@/lib/query/keys';

import { addFavorite, listCollections, listFavorites, removeFavorite } from './api';

export function useFavorites() {
  const { user } = useSession();
  const userId = user?.id;
  return useQuery({
    queryKey: keys.favorites.list(userId ?? ''),
    queryFn: () => listFavorites(userId!),
    enabled: Boolean(userId),
  });
}

export function useCollections() {
  const { user } = useSession();
  const userId = user?.id;
  return useQuery({
    queryKey: keys.collections.list(userId ?? ''),
    queryFn: () => listCollections(userId!),
    enabled: Boolean(userId),
  });
}

/** True when this recipe is in the user's favourites, read off the cached list. */
export function useIsFavorite(recipeId: string | undefined): boolean {
  const favorites = useFavorites();
  if (!recipeId) return false;
  return favorites.data?.some((recipe) => recipe.id === recipeId) ?? false;
}

/**
 * The heart button. Optimistic because in a kitchen the tap must land instantly,
 * and rolling back a favourite is harmless if the write fails.
 *
 * The mutation takes the whole card rather than an id so the optimistic insert
 * has something to render: the favourites list is a list of cards, and refetching
 * it just to show a heart the user already tapped would defeat the point.
 */
export function useToggleFavorite() {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id;

  return useMutation({
    mutationFn: ({ recipe, next }: { recipe: RecipeCard; next: boolean }) =>
      next ? addFavorite(userId!, recipe.id) : removeFavorite(userId!, recipe.id),

    onMutate: async ({ recipe, next }) => {
      const listKey = keys.favorites.list(userId ?? '');
      await client.cancelQueries({ queryKey: listKey });
      const previous = client.getQueryData<RecipeCard[]>(listKey);

      client.setQueryData<RecipeCard[]>(listKey, (current = []) =>
        next
          ? current.some((entry) => entry.id === recipe.id)
            ? current
            : [recipe, ...current]
          : current.filter((entry) => entry.id !== recipe.id),
      );

      return { previous, listKey };
    },

    // Restore whatever was there, including `undefined` — writing the snapshot
    // back unconditionally also covers the case where the list had never loaded
    // and the optimistic insert created the entry from nothing.
    onError: (_error, _variables, context) => {
      if (context) client.setQueryData(context.listKey, context.previous);
    },

    onSettled: () => client.invalidateQueries({ queryKey: keys.favorites.all }),
  });
}
