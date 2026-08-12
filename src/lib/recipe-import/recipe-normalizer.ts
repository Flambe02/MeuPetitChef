/**
 * RawRecipe → CanonicalRecipe. The one place a source becomes *our* shape.
 *
 * Providers call this and then patch what only they know; everything general —
 * times, servings, difficulty, the single cooking path an import produces —
 * lives here so a new provider inherits it for free.
 *
 * Nothing is translated (see `docs/recipe-importers.md`, "Ne pas traduire
 * maintenant"): the recipe keeps its source language and its source ingredient
 * names, and the Brazilian adaptation is a separate, explicit pass.
 */
import type { Difficulty } from '@/domain/types';

import type { CanonicalPath, CanonicalRecipe, NormalizeOptions, RawRecipe } from './types.ts';
import { fold, parseNumber, slugify, squish, truncate } from './text.ts';
import { toMinutes } from './duration.ts';
import { normalizeIngredients } from './ingredient-normalizer.ts';
import { normalizeSteps, requiredEquipment } from './step-normalizer.ts';
import { recipeFingerprint } from './fingerprint.ts';

/** `default_servings` is checked `between 1 and 30` in the database. */
const MIN_SERVINGS = 1;
const MAX_SERVINGS = 30;
const FALLBACK_SERVINGS = 2;

const DIFFICULTY: [RegExp, Difficulty][] = [
  [/facil|facile|easy|leicht|einfach|simple|muito facil/, 'facil'],
  [/medio|moyen|medium|mittel|intermediari/, 'medio'],
  [/dificil|difficile|hard|schwer|avance|advanced|expert/, 'dificil'],
];

/** Language tag → country, for the languages these providers publish in. */
const COUNTRY_BY_LANGUAGE: Record<string, string> = {
  fr: 'FR',
  pt: 'BR',
  de: 'DE',
  en: 'GB',
  es: 'ES',
  it: 'IT',
  nl: 'NL',
};

function parseDifficulty(text: string | null): Difficulty | null {
  if (!text) return null;
  const folded = fold(text);
  for (const [pattern, difficulty] of DIFFICULTY) {
    if (pattern.test(folded)) return difficulty;
  }
  return null;
}

/** "6", "6 portions", "12 Stück", "4-6 pessoas" → a number inside the DB's range. */
export function parseServings(raw: RawRecipe): number | null {
  const explicit = raw.servings;
  if (explicit !== null && Number.isFinite(explicit)) {
    return clampServings(explicit);
  }
  const parsed = parseNumber(raw.yieldText ?? '');
  return parsed === null ? null : clampServings(parsed);
}

function clampServings(value: number): number {
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(value)));
}

export function languageToCountry(language: string): string {
  const [base, region] = language.split(/[-_]/);
  if (region) return region.toUpperCase();
  return COUNTRY_BY_LANGUAGE[(base ?? '').toLowerCase()] ?? 'FR';
}

/**
 * Total time, in seconds.
 *
 * Preference order: what the source declared, then prep + cook, then the sum of
 * the step timers. The last one under-reports (it counts only steps that carry
 * a duration) but a recipe whose steps add up to 35 minutes is better served by
 * "35 min" than by nothing.
 */
function totalSeconds(raw: RawRecipe, stepSeconds: number): number {
  if (raw.totalTimeSeconds && raw.totalTimeSeconds > 0) return raw.totalTimeSeconds;
  const parts = (raw.prepTimeSeconds ?? 0) + (raw.cookTimeSeconds ?? 0);
  if (parts > 0) return parts;
  return stepSeconds;
}

/**
 * Builds the recipe's single cooking path.
 *
 * One import, one path — the route the source published. A second appliance is
 * a second `cooking_paths` row added later, which is the mechanism the app
 * already uses; there is deliberately no per-step `variants` object here, since
 * that would be a competing model of the same thing.
 */
function buildPath(raw: RawRecipe): CanonicalPath {
  const steps = normalizeSteps(raw.steps);
  const equipment = requiredEquipment(steps);
  const stepSeconds = steps.reduce((sum, step) => sum + (step.durationSeconds ?? 0), 0);

  const isThermomix = equipment.includes('thermomix');
  const total = totalSeconds(raw, stepSeconds);

  return {
    slug: 'original',
    name: isThermomix ? 'Thermomix' : 'Modo original',
    requiredEquipment: equipment,
    totalMinutes: toMinutes(total > 0 ? total : null),
    activeMinutes: toMinutes(raw.prepTimeSeconds),
    isRecommended: true,
    reason: `Passo a passo original — ${raw.provider}`,
    steps,
  };
}

export function normalizeRecipe(raw: RawRecipe, options: NormalizeOptions): CanonicalRecipe {
  const title = squish(raw.title ?? '');
  const ingredients = normalizeIngredients(raw.ingredients);
  const path = buildPath(raw);

  const stepSeconds = path.steps.reduce((sum, step) => sum + (step.durationSeconds ?? 0), 0);
  const total = totalSeconds(raw, stepSeconds);

  const language = raw.language ?? 'fr-FR';
  const fingerprint = recipeFingerprint(raw.provider, title, ingredients);

  const tags = [...new Set(raw.keywords.map((keyword) => squish(keyword)).filter(Boolean))];

  return {
    title,
    // Suffixed with the fingerprint head because `recipes.slug` is globally
    // unique and two sites will publish "Gratin dauphinois". Deterministic, so
    // re-importing the same page lands on the same slug instead of a new one.
    slug: `${slugify(truncate(title, 60)) || 'receita'}-${fingerprint.slice(0, 6)}`,
    subtitle: null,
    description: raw.description ? squish(raw.description) : null,
    language,
    country: languageToCountry(language),

    servings: options.servings ?? parseServings(raw) ?? FALLBACK_SERVINGS,
    prepTimeSeconds: raw.prepTimeSeconds,
    cookTimeSeconds: raw.cookTimeSeconds,
    totalTimeSeconds: total,
    difficulty: parseDifficulty(raw.difficultyText) ?? 'facil',

    cuisine: raw.cuisine ? squish(raw.cuisine) : null,
    category: raw.category ? squish(raw.category) : null,
    tags,

    ingredients,
    paths: [path],
    notes: raw.notes,

    nutrition: raw.nutrition,
    nutritionMode: 'normal',

    source: {
      provider: raw.provider,
      url: raw.sourceUrl,
      externalId: raw.externalId,
      importedAt: options.importedAt,
      // Kept as a URL and never downloaded — the app ships its own photography.
      imageUrl: raw.imageUrl,
      authorName: raw.authorName,
      language: raw.language,
    },
    fingerprint,
  };
}
