import type { MealPlanEntry, Profile, RecipeCard } from '@/domain/types';

import type { PlannedEntry } from './types';

/** A minimal, valid `RecipeCard` — every planning test builds its fixtures from this. */
export function buildRecipeCard(overrides: Partial<RecipeCard> = {}): RecipeCard {
  return {
    id: overrides.id ?? 'recipe-1',
    slug: overrides.slug ?? overrides.id ?? 'recipe-1',
    title: 'Receita de teste',
    subtitle: null,
    heroImagePath: null,
    heroImageUrl: null,
    authorName: 'Petit Chef',
    cuisine: null,
    category: null,
    difficulty: 'facil',
    totalMinutes: 30,
    activeMinutes: null,
    defaultServings: 2,
    ratingAvg: 0,
    ratingCount: 0,
    equipment: [],
    tags: [],
    variants: {
      normal: {
        id: 'variant-1',
        kcal: 500,
        protein_g: 30,
        carbs_g: null,
        fat_g: null,
        fiber_g: null,
        summary: null,
        changes: [],
      },
    },
    ...overrides,
  };
}

/** A minimal, valid `meal_plan_entries` row. */
export function buildMealPlanEntry(overrides: Partial<MealPlanEntry> = {}): MealPlanEntry {
  return {
    id: overrides.id ?? 'entry-1',
    user_id: 'user-1',
    plan_date: '2026-08-17',
    slot: 'almoco',
    recipe_id: 'recipe-1',
    custom_title: null,
    servings: 2,
    mode: null,
    source: 'manual',
    note: null,
    created_at: '2026-08-17T12:00:00.000Z',
    updated_at: '2026-08-17T12:00:00.000Z',
    entry_type: 'recipe',
    status: 'planned',
    locked: false,
    parent_entry_id: null,
    cooked_at: null,
    ...overrides,
  };
}

export function buildPlannedEntry(
  entryOverrides: Partial<MealPlanEntry> = {},
  recipe: RecipeCard | null = buildRecipeCard(),
): PlannedEntry {
  return { entry: buildMealPlanEntry(entryOverrides), recipe };
}

export function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    display_name: null,
    avatar_path: null,
    locale: 'pt-BR',
    role: 'user',
    chef_mode: 'normal',
    skill_level: null,
    default_servings: 2,
    max_active_minutes: null,
    daily_kcal_goal: null,
    daily_protein_goal_g: null,
    theme: 'porcelain',
    keep_screen_awake: true,
    timer_sound: true,
    voice_guidance: false,
    onboarding_completed_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}
