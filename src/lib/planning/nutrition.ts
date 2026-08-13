import type { ChefMode } from '@/domain/types';

import type { DailyNutrition, PlannedEntry, WeeklyNutrition } from './types';

/**
 * One entry's contribution to the day's kcal/protein, scaled from the
 * recipe's per-`defaultServings` variant to however many servings this entry
 * actually plans for.
 *
 * `eating_out` and `skipped` contribute nothing — their nutrition is unknown,
 * not zero, but a cooking app has no business inventing a restaurant's
 * macros, so they are left out of the total rather than guessed at.
 */
function entryNutrition(planned: PlannedEntry, mode: ChefMode): DailyNutrition {
  const { entry, recipe } = planned;
  if (entry.entry_type !== 'recipe' && entry.entry_type !== 'leftover') return { kcal: 0, proteinG: 0 };
  if (!recipe) return { kcal: 0, proteinG: 0 };

  const variant = recipe.variants[entry.mode ?? mode] ?? recipe.variants.normal;
  if (!variant || recipe.defaultServings <= 0) return { kcal: 0, proteinG: 0 };

  const factor = entry.servings / recipe.defaultServings;
  return {
    kcal: (variant.kcal ?? 0) * factor,
    proteinG: (variant.protein_g ?? 0) * factor,
  };
}

/** One day's total, across every entry planned for it. */
export function computeDailyNutrition(dayEntries: PlannedEntry[], mode: ChefMode): DailyNutrition {
  return dayEntries.reduce(
    (total, planned) => {
      const { kcal, proteinG } = entryNutrition(planned, mode);
      return { kcal: total.kcal + kcal, proteinG: total.proteinG + proteinG };
    },
    { kcal: 0, proteinG: 0 },
  );
}

/**
 * The week's daily average — over 7 days always, not just the days that had
 * something planned. A half-empty week should read as under target, not as a
 * misleadingly high average over the two days that were filled in.
 */
export function computeWeeklyNutrition(dailyTotals: DailyNutrition[]): WeeklyNutrition {
  const days = 7;
  const sum = dailyTotals.reduce(
    (total, day) => ({ kcal: total.kcal + day.kcal, proteinG: total.proteinG + day.proteinG }),
    { kcal: 0, proteinG: 0 },
  );
  return { avgKcal: sum.kcal / days, avgProteinG: sum.proteinG / days };
}
