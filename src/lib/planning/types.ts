import type {
  ChefMode,
  EquipmentType,
  MealPlanEntry,
  MealPlanGenerationMode,
  MealSlot,
  Profile,
  RecipeCard,
} from '@/domain/types';

/**
 * Types shared by the weekly planner's engine (`engine.ts`, `variety.ts`,
 * `nutrition.ts`) and its React layer (`features/planning`).
 *
 * Kept out of `domain/types.ts` on purpose — these describe how the planner
 * *thinks*, not a row Supabase returns, and belong next to the code that
 * defines them (`src/lib/recipe-import/types.ts` is the precedent).
 */

export interface WeekRange {
  /** Monday, local time, midnight. */
  start: Date;
  /** Sunday, local time, midnight — `start` plus 6 days. */
  end: Date;
}

/** The five protein categories the variety widget counts — mirrors the brief's own vocabulary. */
export type ProteinType = 'frango' | 'peixe' | 'carne' | 'ovo' | 'vegetal' | 'outro';

/**
 * A `meal_plan_entries` row, with its recipe resolved when it has one.
 *
 * `recipe` is `null` for `entry_type` values that carry no recipe
 * (`eating_out`, `skipped`) and, for a `leftover` entry, for as long as its
 * parent's own recipe hasn't been resolved alongside it.
 */
export interface PlannedEntry {
  entry: MealPlanEntry;
  recipe: RecipeCard | null;
}

export interface GenerationPreferences {
  meals: MealSlot[];
  /** Free-form priority chips ticked in the bottom sheet — "variar bastante", "cozinhar rápido"… */
  priorities: string[];
  /** Weekday indices, Monday = 0 … Sunday = 6 — days that get `entry_type: 'skipped'` instead of a recipe. */
  noCookDays: number[];
}

export interface GenerationContext {
  week: WeekRange;
  mode: ChefMode;
  generationMode: MealPlanGenerationMode;
  preferences: GenerationPreferences;
  profile: Profile | null;
  ownedEquipment: EquipmentType[];
  preferenceValues: string[];
  /** Every published recipe the generator is allowed to place — already filtered to what `mode` can render. */
  candidates: RecipeCard[];
  /** Entries that exist before generation runs and must never be touched: locked, and — for "melhorar" — manual. */
  fixedEntries: PlannedEntry[];
  /** `cook_sessions.finished_at`, most recent first, for the recency penalty. */
  recentlyCooked: { recipeId: string; finishedAt: string }[];
  /** Injectable so tests can pin the "a few top candidates" tie-break. Defaults to `Math.random`. */
  random?: () => number;
}

export interface GeneratedEntryDraft {
  date: Date;
  slot: MealSlot;
  recipeId: string;
  servings: number;
}

export interface GenerationResult {
  entries: GeneratedEntryDraft[];
  /** One line per slot the generator could not fill — an empty pool, not a crash. */
  warnings: string[];
}

export interface ScoredCandidate {
  recipe: RecipeCard;
  score: number;
}

export interface WeeklyVarietyReport {
  proteinCounts: Record<ProteinType, number>;
  /** 0–100, deterministic — see `variety.ts` for the formula. */
  score: number;
  dominant: ProteinType | null;
  suggestion: string | null;
}

export interface DailyNutrition {
  kcal: number;
  proteinG: number;
}

export interface WeeklyNutrition {
  avgKcal: number;
  avgProteinG: number;
}
