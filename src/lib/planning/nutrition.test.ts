import { describe, expect, it } from 'vitest';

import { buildPlannedEntry, buildRecipeCard } from './test-helpers';
import { computeDailyNutrition, computeWeeklyNutrition } from './nutrition';

describe('computeDailyNutrition', () => {
  it('scales by servings against the recipe\'s own defaultServings', () => {
    const recipe = buildRecipeCard({
      defaultServings: 2,
      variants: {
        normal: {
          id: 'v1',
          kcal: 400,
          protein_g: 30,
          carbs_g: null,
          fat_g: null,
          fiber_g: null,
          summary: null,
          changes: [],
        },
      },
    });
    // Cooked for 4 — double the recipe's own default.
    const day = computeDailyNutrition([buildPlannedEntry({ servings: 4 }, recipe)], 'normal');
    expect(day.kcal).toBe(800);
    expect(day.proteinG).toBe(60);
  });

  it('eating_out and skipped contribute nothing — unknown, not zero-guessed', () => {
    const day = computeDailyNutrition(
      [
        buildPlannedEntry({ entry_type: 'eating_out', recipe_id: null }, null),
        buildPlannedEntry({ entry_type: 'skipped', recipe_id: null }, null),
      ],
      'normal',
    );
    expect(day).toEqual({ kcal: 0, proteinG: 0 });
  });

  it('leftovers count nutrition — cook once, eat multiple times still means eating twice', () => {
    const recipe = buildRecipeCard({ defaultServings: 2 });
    const day = computeDailyNutrition(
      [buildPlannedEntry({ entry_type: 'leftover', servings: 2 }, recipe)],
      'normal',
    );
    expect(day.kcal).toBe(500);
  });

  it('falls back to the normal variant when the entry\'s own mode has none', () => {
    const recipe = buildRecipeCard({
      defaultServings: 2,
      variants: {
        normal: {
          id: 'v1',
          kcal: 500,
          protein_g: 30,
          carbs_g: null,
          fat_g: null,
          fiber_g: null,
          summary: null,
          changes: [],
        },
      },
    });
    const day = computeDailyNutrition([buildPlannedEntry({ mode: 'fit', servings: 2 }, recipe)], 'fit');
    expect(day.kcal).toBe(500);
  });
});

describe('computeWeeklyNutrition', () => {
  it('averages over 7 days even when fewer days have anything planned', () => {
    const result = computeWeeklyNutrition([
      { kcal: 1400, proteinG: 140 },
      { kcal: 1400, proteinG: 140 },
    ]);
    // Two days filled, five empty — divide by 7, not by 2.
    expect(result.avgKcal).toBeCloseTo(400, 5);
    expect(result.avgProteinG).toBeCloseTo(40, 5);
  });
});
