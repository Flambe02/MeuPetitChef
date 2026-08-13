import type { ChefMode, MealPlanGenerationMode, MealSlot, RecipeCard } from '@/domain/types';
import { parseISODate, toISODate } from '@/lib/format';
import { fold } from '@/lib/recipe-import/text';

import { weekDates } from './dates';
import { classifyProtein } from './protein';
import type {
  GenerationContext,
  GenerationResult,
  GeneratedEntryDraft,
  PlannedEntry,
  ProteinType,
  ScoredCandidate,
} from './types';

/**
 * "Construir a melhor semana possível", not just rank recipes one at a time —
 * `generateWeeklyMealPlan` scores every candidate against the week *as it
 * fills*: a chicken dish scores high on Monday and lower by Thursday once two
 * others have already landed, exactly the drift the brief asks for. That
 * mutable context is `WeekState`; everything else here is pure.
 */
interface ScoreWeights {
  profileMatch: number;
  nutrition: number;
  preferences: number;
  variety: number;
  recentHistory: number;
  ingredientReuse: number;
  convenience: number;
}

export const WEEKLY_RECIPE_SCORE_WEIGHTS: ScoreWeights = {
  profileMatch: 0.3,
  nutrition: 0.2,
  preferences: 0.15,
  variety: 0.1,
  recentHistory: 0.1,
  ingredientReuse: 0.1,
  convenience: 0.05,
};

/** The four intentions "Montar minha semana" offers, as a full weight set each — not a diff off the base. */
const MODE_WEIGHTS: Record<MealPlanGenerationMode, ScoreWeights> = {
  equilibrada: WEEKLY_RECIPE_SCORE_WEIGHTS,
  pratica: {
    profileMatch: 0.25,
    nutrition: 0.15,
    preferences: 0.1,
    variety: 0.1,
    recentHistory: 0.05,
    ingredientReuse: 0.15,
    convenience: 0.2,
  },
  economica: {
    profileMatch: 0.2,
    nutrition: 0.15,
    preferences: 0.1,
    variety: 0.1,
    recentHistory: 0.1,
    ingredientReuse: 0.3,
    convenience: 0.05,
  },
  fit: {
    profileMatch: 0.25,
    nutrition: 0.35,
    preferences: 0.1,
    variety: 0.1,
    recentHistory: 0.1,
    ingredientReuse: 0.05,
    convenience: 0.05,
  },
};

export function weightsForMode(mode: MealPlanGenerationMode): ScoreWeights {
  return MODE_WEIGHTS[mode];
}

/**
 * The priority chips in "Como você quer sua semana?" nudge the mode's base
 * weights rather than replacing them — a small, additive push, not a second
 * competing weight table. Ids match `constants.ts`'s `GENERATION_PRIORITIES`.
 */
const PRIORITY_NUDGES: Record<string, Partial<ScoreWeights>> = {
  variar: { variety: 0.08 },
  rapido: { convenience: 0.1 },
  ingredientes: { ingredientReuse: 0.08 },
  economizar: { ingredientReuse: 0.08 },
};

function resolveWeights(ctx: GenerationContext): ScoreWeights {
  const weights = { ...weightsForMode(ctx.generationMode) };
  for (const priority of ctx.preferences.priorities) {
    const nudge = PRIORITY_NUDGES[priority];
    if (!nudge) continue;
    for (const [key, delta] of Object.entries(nudge) as [keyof ScoreWeights, number][]) {
      weights[key] += delta;
    }
  }
  return weights;
}

/* ---------------------------------------------------------------------------
 * Week state — what "the week so far" means to the scorer, and the one thing
 * that changes between one candidate evaluation and the next.
 * ------------------------------------------------------------------------- */

interface WeekState {
  proteinCounts: Partial<Record<ProteinType, number>>;
  /** Chronological, most recent last — only the tail 3 matter (see `varietyScore`). */
  lastProteins: ProteinType[];
  usedRecipeIds: Set<string>;
  usedTags: Set<string>;
}

function emptyState(): WeekState {
  return { proteinCounts: {}, lastProteins: [], usedRecipeIds: new Set(), usedTags: new Set() };
}

function applyPlacement(state: WeekState, recipe: RecipeCard | null): void {
  if (!recipe) return;
  const protein = classifyProtein(recipe);
  state.proteinCounts[protein] = (state.proteinCounts[protein] ?? 0) + 1;
  state.lastProteins.push(protein);
  state.usedRecipeIds.add(recipe.id);
  for (const tag of recipe.tags) state.usedTags.add(tag);
}

function initState(fixed: PlannedEntry[]): WeekState {
  const state = emptyState();
  for (const planned of fixed) applyPlacement(state, planned.recipe);
  return state;
}

function entryKey(date: Date, slot: MealSlot): string {
  return `${toISODate(date)}:${slot}`;
}

/* ---------------------------------------------------------------------------
 * Sub-scores — each returns roughly 0..1. Kept separate and named so a test
 * can pin one signal without dragging the other six along.
 * ------------------------------------------------------------------------- */

function profileMatchScore(candidate: RecipeCard, ctx: GenerationContext): number {
  const hasVariant = Boolean(candidate.variants[ctx.mode]);
  const variantScore = hasVariant ? 0.5 : 0.15;

  const required = candidate.equipment.filter((item) => item !== 'none');
  const equipmentScore =
    required.length === 0
      ? 0.5
      : 0.5 * (required.filter((item) => ctx.ownedEquipment.includes(item)).length / required.length);

  return variantScore + equipmentScore;
}

function nutritionScore(candidate: RecipeCard, ctx: GenerationContext, mealsPerDay: number): number {
  const variant = candidate.variants[ctx.mode] ?? candidate.variants.normal;
  const dailyKcalGoal = ctx.profile?.daily_kcal_goal;
  if (!variant || !dailyKcalGoal) return 0.6; // neutral — nothing to compare against

  const kcalTarget = dailyKcalGoal / mealsPerDay;
  const kcalDeviation = variant.kcal === null ? 0.5 : Math.min(1, Math.abs(variant.kcal - kcalTarget) / kcalTarget);

  const dailyProteinGoal = ctx.profile?.daily_protein_goal_g;
  let proteinScore = 0.5;
  if (dailyProteinGoal && variant.protein_g !== null) {
    const proteinTarget = dailyProteinGoal / mealsPerDay;
    proteinScore = Math.min(1, variant.protein_g / proteinTarget);
  }

  return (1 - kcalDeviation) * 0.5 + proteinScore * 0.5;
}

function preferencesScore(candidate: RecipeCard, ctx: GenerationContext): number {
  const haystack = fold(
    [candidate.cuisine, candidate.category, ...candidate.tags].filter(Boolean).join(' '),
  );

  let score =
    ctx.preferenceValues.length === 0
      ? 0.6 // neutral — nothing was asked for
      : ctx.preferenceValues.some((value) => haystack.includes(fold(value)))
        ? 1
        : 0.5;

  // "Mais receitas brasileiras" is specific enough to deserve its own bonus
  // rather than riding on the generic preference-chip match above.
  if (ctx.preferences.priorities.includes('brasileiras') && haystack.includes('brasileir')) {
    score = Math.min(1, score + 0.3);
  }

  return score;
}

/**
 * The anti-repetition signal. Two effects stack: a mild, per-use decay (each
 * prior use of the same protein this week costs 0.35), and a hard drop when
 * the candidate's protein matches the *last three* placements in a row — the
 * brief's own example ("three chicken dishes in a row").
 */
function varietyScore(candidate: RecipeCard, state: WeekState): number {
  const protein = classifyProtein(candidate);
  const usesSoFar = state.proteinCounts[protein] ?? 0;
  let score = Math.max(0, 1 - usesSoFar * 0.35);

  const last3 = state.lastProteins.slice(-3);
  if (last3.length === 3 && last3.every((entry) => entry === protein)) score *= 0.3;

  return score;
}

/** Penalises a recipe already placed this week, and one cooked too recently before it. */
function recentHistoryScore(candidate: RecipeCard, ctx: GenerationContext, state: WeekState): number {
  if (state.usedRecipeIds.has(candidate.id)) return 0.1;

  const cooked = ctx.recentlyCooked.find((entry) => entry.recipeId === candidate.id);
  if (!cooked) return 1;

  const daysSince = (Date.now() - new Date(cooked.finishedAt).getTime()) / 86_400_000;
  return Math.max(0.1, Math.min(1, daysSince / 14));
}

/**
 * A light bonus for sharing tags with what the week already has — the
 * approximation stands in for real ingredient overlap: `recipe_cards` (what
 * the candidate pool is built from) carries tags, not ingredient lists, and
 * fetching the full ingredients of every candidate would reintroduce the N+1
 * that view exists to avoid. Capped at two shared tags on purpose — this is a
 * bonus, not a replacement for `variety`.
 */
function ingredientReuseScore(candidate: RecipeCard, state: WeekState): number {
  if (state.usedTags.size === 0) return 0.5;
  const overlap = candidate.tags.filter((tag) => state.usedTags.has(tag)).length;
  return Math.min(1, overlap / 2);
}

function convenienceScore(candidate: RecipeCard): number {
  if (candidate.totalMinutes <= 30) return 1;
  if (candidate.totalMinutes <= 45) return 0.7;
  if (candidate.totalMinutes <= 60) return 0.4;
  return 0.2;
}

function scoreCandidate(
  candidate: RecipeCard,
  ctx: GenerationContext,
  state: WeekState,
  weights: ScoreWeights,
  mealsPerDay: number,
): number {
  return (
    profileMatchScore(candidate, ctx) * weights.profileMatch +
    nutritionScore(candidate, ctx, mealsPerDay) * weights.nutrition +
    preferencesScore(candidate, ctx) * weights.preferences +
    varietyScore(candidate, state) * weights.variety +
    recentHistoryScore(candidate, ctx, state) * weights.recentHistory +
    ingredientReuseScore(candidate, state) * weights.ingredientReuse +
    convenienceScore(candidate) * weights.convenience
  );
}

/**
 * A weighted draw among the top `topK` — never a flat pick of #1 every time
 * (two "Montar minha semana" runs would be identical), never a pure random
 * draw across the whole pool either (the brief is explicit: weighted by
 * score, restricted to a handful of good candidates).
 */
function pickWeighted(scored: ScoredCandidate[], topK: number, random: () => number): ScoredCandidate {
  const pool = [...scored].sort((a, b) => b.score - a.score).slice(0, Math.min(topK, scored.length));
  const weights = pool.map((candidate) => Math.max(candidate.score, 0.01));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let roll = random() * total;
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index]!;
    if (roll <= 0) return pool[index]!;
  }
  return pool[pool.length - 1]!;
}

/* ---------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */

function fillableSlots(
  ctx: GenerationContext,
  fixedKeys: Set<string>,
): { date: Date; slot: MealSlot }[] {
  const slots: { date: Date; slot: MealSlot }[] = [];
  weekDates(ctx.week.start).forEach((date, dayIndex) => {
    if (ctx.preferences.noCookDays.includes(dayIndex)) return;
    for (const slot of ctx.preferences.meals) {
      if (fixedKeys.has(entryKey(date, slot))) continue;
      slots.push({ date, slot });
    }
  });
  return slots;
}

/**
 * Fills every slot `ctx.preferences` asks for except the ones already in
 * `ctx.fixedEntries` — which the caller controls entirely: pass only the
 * locked entries for "Montar minha semana", and locked-plus-manual for
 * "Melhorar minha semana", and this same function serves both. A slot with no
 * viable candidate is skipped, not failed — see `warnings`.
 */
export function generateWeeklyMealPlan(ctx: GenerationContext): GenerationResult {
  const weights = resolveWeights(ctx);
  const random = ctx.random ?? Math.random;
  const mealsPerDay = ctx.preferences.meals.length || 2;
  const servings = ctx.profile?.default_servings ?? 2;

  const fixedKeys = new Set(
    ctx.fixedEntries.map((planned) => entryKey(parseISODate(planned.entry.plan_date), planned.entry.slot)),
  );
  const state = initState(ctx.fixedEntries);

  const entries: GeneratedEntryDraft[] = [];
  const warnings: string[] = [];

  for (const { date, slot } of fillableSlots(ctx, fixedKeys)) {
    if (ctx.candidates.length === 0) {
      warnings.push(`Nenhuma receita disponível para ${toISODate(date)} (${slot}).`);
      continue;
    }

    const scored: ScoredCandidate[] = ctx.candidates.map((recipe) => ({
      recipe,
      score: scoreCandidate(recipe, ctx, state, weights, mealsPerDay),
    }));
    const chosen = pickWeighted(scored, 5, random);

    entries.push({ date, slot, recipeId: chosen.recipe.id, servings });
    applyPlacement(state, chosen.recipe);
  }

  return { entries, warnings };
}

/**
 * "Sugerir para mim" — up to `count` alternatives for one slot, ranked
 * (not weighted-random: a manual re-roll should be explicable, not a second
 * dice throw). `ctx.fixedEntries` here is expected to be *every other* entry
 * already on the week, so the suggestion still respects the week's variety.
 */
export function generateMealSuggestion(
  ctx: GenerationContext,
  excludeRecipeId?: string,
  count = 3,
): RecipeCard[] {
  const weights = resolveWeights(ctx);
  const mealsPerDay = ctx.preferences.meals.length || 2;
  const state = initState(ctx.fixedEntries);

  const pool = ctx.candidates.filter((recipe) => recipe.id !== excludeRecipeId);
  const scored = pool
    .map((recipe) => ({ recipe, score: scoreCandidate(recipe, ctx, state, weights, mealsPerDay) }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map((entry) => entry.recipe);
}

/** "Mais leve" / "Mais rápida" / "Algo diferente" — display labels for `generateMealSuggestion`'s output. */
export function labelSuggestions(
  alternatives: RecipeCard[],
  mode: ChefMode,
): { recipe: RecipeCard; label: string }[] {
  if (alternatives.length === 0) return [];

  const lightest = [...alternatives].sort(
    (a, b) => (a.variants[mode]?.kcal ?? Infinity) - (b.variants[mode]?.kcal ?? Infinity),
  )[0];
  const fastest = [...alternatives].sort((a, b) => a.totalMinutes - b.totalMinutes)[0];

  return alternatives.map((recipe) => {
    if (recipe === lightest) return { recipe, label: 'Mais leve' };
    if (recipe === fastest) return { recipe, label: 'Mais rápida' };
    return { recipe, label: 'Algo diferente' };
  });
}
