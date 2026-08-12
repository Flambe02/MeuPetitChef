import { useQuery } from '@tanstack/react-query';

import type { ChefMode } from '@/domain/types';
import { keys, type RecipeSearchParams } from '@/lib/query/keys';

import { getRecipeDetail, getSuggestions, searchRecipes } from './api';

export function useRecipeSearch(params: RecipeSearchParams = {}) {
  return useQuery({
    queryKey: keys.recipes.list(params),
    queryFn: () => searchRecipes(params),
  });
}

export function useRecipe(slug: string | undefined, mode: ChefMode = 'normal') {
  return useQuery({
    queryKey: keys.recipes.detail(slug ?? '', mode),
    queryFn: () => getRecipeDetail(slug!, mode),
    enabled: Boolean(slug),
  });
}

/**
 * Ranked against the caller's equipment, so the key carries the chef mode and
 * the whole namespace is invalidated when the profile changes — see
 * `useUpdateProfile`, which already nukes `keys.recipes.all` for that reason.
 */
export function useSuggestions(mode: ChefMode = 'normal', limit = 6) {
  return useQuery({
    queryKey: keys.recipes.suggestions(mode, limit),
    queryFn: () => getSuggestions(mode, limit),
  });
}
