import { describe, expect, it } from 'vitest';

import type { RecipeCard } from '@/domain/types';

import { weekRange } from './dates';
import { generateMealSuggestion, generateWeeklyMealPlan, labelSuggestions, weightsForMode } from './engine';
import { buildPlannedEntry, buildProfile, buildRecipeCard } from './test-helpers';
import type { GenerationContext } from './types';

const WEEK_START = new Date(2026, 7, 17); // Monday

function baseContext(overrides: Partial<GenerationContext> = {}): GenerationContext {
  return {
    week: weekRange(WEEK_START),
    mode: 'normal',
    generationMode: 'equilibrada',
    preferences: { meals: ['almoco'], priorities: [], noCookDays: [] },
    profile: buildProfile(),
    ownedEquipment: [],
    preferenceValues: [],
    candidates: [buildRecipeCard()],
    fixedEntries: [],
    recentlyCooked: [],
    random: () => 0, // always the top-scored candidate — deterministic assertions
    ...overrides,
  };
}

describe('generateWeeklyMealPlan', () => {
  it('fills both almoço and jantar for every day of the week', () => {
    const result = generateWeeklyMealPlan(
      baseContext({ preferences: { meals: ['almoco', 'jantar'], priorities: [], noCookDays: [] } }),
    );
    expect(result.entries).toHaveLength(14);
    const almocos = result.entries.filter((e) => e.slot === 'almoco');
    const jantares = result.entries.filter((e) => e.slot === 'jantar');
    expect(almocos).toHaveLength(7);
    expect(jantares).toHaveLength(7);
  });

  it('skips the days marked "não preciso cozinhar"', () => {
    // Monday (0) and Wednesday (2) are no-cook days.
    const result = generateWeeklyMealPlan(
      baseContext({ preferences: { meals: ['almoco'], priorities: [], noCookDays: [0, 2] } }),
    );
    expect(result.entries).toHaveLength(5);
    const skippedDates = [new Date(2026, 7, 17), new Date(2026, 7, 19)].map((d) => d.getDate());
    for (const entry of result.entries) {
      expect(skippedDates).not.toContain(entry.date.getDate());
    }
  });

  it('never overwrites a locked slot', () => {
    const lockedRecipe = buildRecipeCard({ id: 'locked-recipe' });
    const otherRecipe = buildRecipeCard({ id: 'other-recipe' });
    const result = generateWeeklyMealPlan(
      baseContext({
        preferences: { meals: ['almoco'], priorities: [], noCookDays: [] },
        candidates: [otherRecipe],
        fixedEntries: [
          buildPlannedEntry({ plan_date: '2026-08-17', slot: 'almoco', locked: true, recipe_id: 'locked-recipe' }, lockedRecipe),
        ],
      }),
    );
    // 7 days, Monday already fixed — 6 slots left to fill.
    expect(result.entries).toHaveLength(6);
    expect(result.entries.some((e) => e.date.getDate() === 17)).toBe(false);
    expect(result.entries.every((e) => e.recipeId === 'other-recipe')).toBe(true);
  });

  it('respects equipment: the recipe the kitchen can actually cook wins, all else equal', () => {
    const unequipped = buildRecipeCard({ id: 'needs-thermomix', title: 'Prato A', equipment: ['thermomix'] });
    const equipped = buildRecipeCard({ id: 'needs-stovetop', title: 'Prato B', equipment: ['stovetop'] });
    const result = generateWeeklyMealPlan(
      baseContext({
        preferences: { meals: ['almoco'], priorities: [], noCookDays: [1, 2, 3, 4, 5, 6] }, // Monday only
        candidates: [unequipped, equipped],
        ownedEquipment: ['stovetop'],
      }),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.recipeId).toBe('needs-stovetop');
  });

  it('avoids excessive repetition: three chicken dishes in a row drop chicken below an equally-good alternative', () => {
    const chicken = buildRecipeCard({ id: 'chicken', title: 'Frango grelhado', tags: [] });
    const fish = buildRecipeCard({ id: 'fish', title: 'Salmão grelhado', tags: [] });

    const threeChickenDinners = ['2026-08-17', '2026-08-18', '2026-08-19'].map((date) =>
      buildPlannedEntry({ plan_date: date, slot: 'jantar', locked: true, recipe_id: 'chicken' }, chicken),
    );

    const result = generateWeeklyMealPlan(
      baseContext({
        preferences: { meals: ['jantar'], priorities: [], noCookDays: [0, 1, 2, 4, 5, 6] }, // Thursday (3) only
        candidates: [chicken, fish],
        fixedEntries: threeChickenDinners,
      }),
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.recipeId).toBe('fish');
  });

  it('does not crash on an empty candidate pool — it warns and leaves the slot empty', () => {
    const result = generateWeeklyMealPlan(
      baseContext({ preferences: { meals: ['almoco'], priorities: [], noCookDays: [1, 2, 3, 4, 5, 6] }, candidates: [] }),
    );
    expect(result.entries).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('uses the profile\'s own default_servings for generated entries', () => {
    const result = generateWeeklyMealPlan(
      baseContext({
        preferences: { meals: ['almoco'], priorities: [], noCookDays: [1, 2, 3, 4, 5, 6] },
        profile: buildProfile({ default_servings: 4 }),
      }),
    );
    expect(result.entries[0]!.servings).toBe(4);
  });
});

describe('generateMealSuggestion', () => {
  it('returns up to `count` alternatives, ranked, excluding the current recipe', () => {
    const candidates: RecipeCard[] = [
      buildRecipeCard({ id: 'a' }),
      buildRecipeCard({ id: 'b' }),
      buildRecipeCard({ id: 'c' }),
      buildRecipeCard({ id: 'd' }),
    ];
    const alternatives = generateMealSuggestion(baseContext({ candidates }), 'a', 3);
    expect(alternatives).toHaveLength(3);
    expect(alternatives.some((r) => r.id === 'a')).toBe(false);
  });
});

describe('labelSuggestions', () => {
  it('labels the lowest-kcal option "Mais leve" and the fastest "Mais rápida"', () => {
    const light = buildRecipeCard({
      id: 'light',
      totalMinutes: 40,
      variants: { normal: { id: 'v', kcal: 300, protein_g: 20, carbs_g: null, fat_g: null, fiber_g: null, summary: null, changes: [] } },
    });
    const fast = buildRecipeCard({ id: 'fast', totalMinutes: 10 });
    const other = buildRecipeCard({ id: 'other', totalMinutes: 50 });

    const labeled = labelSuggestions([light, fast, other], 'normal');
    expect(labeled.find((l) => l.recipe.id === 'light')!.label).toBe('Mais leve');
    expect(labeled.find((l) => l.recipe.id === 'fast')!.label).toBe('Mais rápida');
    expect(labeled.find((l) => l.recipe.id === 'other')!.label).toBe('Algo diferente');
  });

  it('returns an empty array for no alternatives', () => {
    expect(labelSuggestions([], 'normal')).toEqual([]);
  });
});

describe('weightsForMode', () => {
  it('every mode returns a full, positive weight for every dimension', () => {
    for (const mode of ['equilibrada', 'pratica', 'economica', 'fit'] as const) {
      const weights = weightsForMode(mode);
      for (const value of Object.values(weights)) {
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});
