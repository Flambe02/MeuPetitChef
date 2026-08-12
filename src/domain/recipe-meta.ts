import type { ChefMode, RecipeCard } from './types';

import { formatDuration, formatKcal, formatServings } from '@/lib/format';

/**
 * The mono line under a recipe title.
 *
 * Split from the components that render it so Fast Refresh keeps working —
 * a module exporting both components and helpers loses it, which is the same
 * reason `session-context.ts` is separate from `SessionProvider.tsx`.
 */
const DIFFICULTY: Record<string, string> = {
  facil: 'Fácil',
  medio: 'Médio',
  dificil: 'Difícil',
};

/** "35 min · 8 porções · Fácil" — for list rows, where there is room. */
export function recipeMeta(recipe: RecipeCard): string {
  return [
    formatDuration(recipe.totalMinutes),
    formatServings(recipe.defaultServings),
    DIFFICULTY[recipe.difficulty] ?? recipe.difficulty,
  ].join(' · ');
}

/** "25 min · 420 kcal" — for dense grids, where the servings do not fit. */
export function recipeMetaShort(recipe: RecipeCard, mode: ChefMode): string {
  const kcal = recipe.variants[mode]?.kcal ?? recipe.variants.normal?.kcal ?? null;
  return [formatDuration(recipe.totalMinutes), kcal === null ? null : formatKcal(kcal)]
    .filter(Boolean)
    .join(' · ');
}
