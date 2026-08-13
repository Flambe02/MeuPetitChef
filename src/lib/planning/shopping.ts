import type { MealPlanEntry } from '@/domain/types';

/**
 * Which of a week's entries belong on the shopping list — only a freshly
 * cooked recipe. `leftover` is deliberately excluded: its ingredients were
 * already bought for the entry it points at, and re-adding them would double
 * the shopping list for one dish eaten twice. `eating_out` and `skipped`
 * never had ingredients to begin with.
 */
export function recipeEntriesForShoppingList(entries: MealPlanEntry[]): MealPlanEntry[] {
  return entries.filter((entry) => entry.entry_type === 'recipe' && entry.recipe_id !== null);
}
