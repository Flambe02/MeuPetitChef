/**
 * Every model answer is parsed here before anything else looks at it.
 *
 * §36 of the brief asks for strict validation with one automatic retry, then
 * `needs_review`. The retry lives in the pipeline; this file decides what
 * "valid" means, and it is deliberately strict about *shape* and forgiving about
 * *noise*.
 *
 * The noise is not hypothetical. `docs/recipe-importers.md` records it from a
 * real run: a schema declaring `["string", "null"]` does not stop a model
 * answering with the four-character string `"null"`, and the day it did, the
 * word `null` was written onto six ingredients. `cleanText` normalises that
 * family of answers — `"null"`, `"none"`, `"N/A"`, `"-"`, empty — into a real
 * `null`, *before* validation, so a non-answer never becomes content.
 */
import { z } from 'zod';

import type { MagazinePageKind } from '@/domain/types';

const PAGE_KINDS = [
  'cover',
  'advertisement',
  'editorial',
  'index',
  'article',
  'recipe',
  'recipe_index',
  'unknown',
] as const satisfies readonly MagazinePageKind[];

/** Answers that mean "nothing", whatever they look like. */
const EMPTY_ANSWERS = new Set(['null', 'none', 'n/a', 'na', '-', '—', 'nil', 'undefined', '']);

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return EMPTY_ANSWERS.has(trimmed.toLowerCase()) ? null : trimmed;
}

/** A field that may legitimately be absent. Never yields an empty string. */
const nullableText = z.unknown().transform(cleanText);

/** Text that must be there. A blank answer is a failed extraction, not a title. */
const requiredText = z
  .unknown()
  .transform(cleanText)
  .refine((value): value is string => value !== null && value.length > 0, {
    message: 'campo obrigatório vazio',
  });

/**
 * A number, or nothing.
 *
 * Models write quantities as `250`, `"250"`, `"250 g"` and `"2 à 3"`. The first
 * three are the same fact; the fourth is a range, and taking its lower bound is
 * a decision — so it is taken explicitly and visibly here rather than by a
 * regex somewhere downstream.
 */
const nullableNumber = z.unknown().transform((value): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = cleanText(value);
  if (text === null) return null;
  const match = /-?\d+(?:[.,]\d+)?/.exec(text.replace(/\s/g, ''));
  if (!match) return null;
  const parsed = Number.parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
});

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const probability = z.unknown().transform((value): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
  const text = cleanText(value);
  if (text === null) return 0;
  const parsed = Number.parseFloat(text.replace('%', '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return 0;
  // "96" means 96 %, "0.96" means the same thing. Both are written in the wild.
  return clamp01(parsed > 1 ? parsed / 100 : parsed);
});

const stringList = z.unknown().transform((value): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter((entry): entry is string => entry !== null);
});

/* ---------------------------------------------------------------------------
 * Page classification
 * ------------------------------------------------------------------------- */

export const pageVerdictSchema = z.object({
  kind: z.enum(PAGE_KINDS).catch('unknown'),
  confidence: probability,
  reasons: stringList,
  recipeTitles: stringList,
});

export type PageVerdictPayload = z.infer<typeof pageVerdictSchema>;

/* ---------------------------------------------------------------------------
 * The recipe index
 * ------------------------------------------------------------------------- */

export const recipeIndexSchema = z.object({
  entries: z
    .array(
      z.object({
        title: requiredText,
        folio: nullableNumber,
      }),
    )
    .default([]),
});

/* ---------------------------------------------------------------------------
 * The recipes
 * ------------------------------------------------------------------------- */

const confidenceSchema = z
  .object({
    overall: probability,
    title: probability,
    ingredients: probability,
    steps: probability,
  })
  .catch({ overall: 0, title: 0, ingredients: 0, steps: 0 });

const ingredientSchema = z.object({
  quantity: nullableNumber,
  unit: nullableText,
  ingredient: requiredText,
  preparation: nullableText,
  optional: z.unknown().transform((value) => value === true),
});

const stepSchema = z.object({
  order: nullableNumber,
  instruction: requiredText,
});

export const magazineRecipeSchema = z.object({
  title: requiredText,
  description: nullableText,
  servings: nullableNumber,
  prepMinutes: nullableNumber,
  cookMinutes: nullableNumber,
  restMinutes: nullableNumber,
  // An ingredient list that failed to parse is not an empty ingredient list.
  // The array may be empty — some magazines print "voir p. 12" — but a line
  // whose name did not survive is dropped rather than kept as a blank row.
  ingredients: z.array(ingredientSchema).default([]),
  steps: z.array(stepSchema).default([]),
  tips: stringList,
  notes: stringList,
  language: nullableText,
  continuationBefore: z.unknown().transform((value) => value === true),
  continuationAfter: z.unknown().transform((value) => value === true),
  confidence: confidenceSchema,
});

export const extractionSchema = z.object({
  recipes: z.array(magazineRecipeSchema).default([]),
});

export type ExtractionPayload = z.infer<typeof extractionSchema>;
