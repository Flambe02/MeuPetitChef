/**
 * Schema.org extraction — strategy A for every provider.
 *
 * A `<script type="application/ld+json">` carrying `"@type": "Recipe"` is a
 * contract the site maintains for Google, which makes it far more stable than
 * any CSS selector. Both Cookomix and Cookidoo publish one, so the DOM parsers
 * downstream only ever *enrich* what this returns.
 *
 * Everything here is defensive: JSON-LD in the wild is `@graph`-wrapped, array
 * -wrapped, single-string-instead-of-array, and occasionally invalid JSON. A
 * throw in this file would abort an import over a broken breadcrumb block.
 */
import type { RawIngredientLine, RawNutrition, RawStepLine } from './types.ts';
import { parseNumber, squish } from './text.ts';
import { parseDuration } from './duration.ts';
import { parseEnergyKcal } from './units.ts';

export type JsonObject = Record<string, unknown>;

/** Every JSON-LD node in a document, flattened out of `@graph` and arrays. */
export function extractJsonLd(document: Document): JsonObject[] {
  const nodes: JsonObject[] = [];

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.textContent;
    if (!raw?.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A malformed block is not a reason to fail the whole page.
      continue;
    }
    collect(parsed, nodes);
  }

  return nodes;
}

function collect(value: unknown, into: JsonObject[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collect(entry, into);
    return;
  }
  if (!isObject(value)) return;

  into.push(value);
  if ('@graph' in value) collect(value['@graph'], into);
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function types(node: JsonObject): string[] {
  const type = node['@type'];
  if (typeof type === 'string') return [type];
  if (Array.isArray(type))
    return type.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

/** The first `Recipe` node in a document, if any. */
export function findRecipeNode(nodes: JsonObject[]): JsonObject | null {
  return nodes.find((node) => types(node).some((type) => /(^|\/)Recipe$/i.test(type))) ?? null;
}

/* ---------------------------------------------------------------------------
 * Field readers
 * ------------------------------------------------------------------------- */

/** First non-empty string for a key, unwrapping arrays and `{"@value": …}`. */
export function readString(node: JsonObject, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = flattenString(node[key]);
    if (value) return value;
  }
  return null;
}

function flattenString(value: unknown): string | null {
  if (typeof value === 'string') return squish(value) || null;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = flattenString(entry);
      if (found) return found;
    }
    return null;
  }
  if (isObject(value)) {
    return flattenString(value['@value'] ?? value.name ?? value.text ?? null);
  }
  return null;
}

/** Every string under a key ("recipeCategory" is often an array). */
export function readStringList(node: JsonObject, ...keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const value = node[key];
    if (typeof value === 'string') {
      // "Gratins, Sans gluten" — Cookomix comma-joins its keywords.
      out.push(...value.split(',').map(squish).filter(Boolean));
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        const found = flattenString(entry);
        if (found) out.push(found);
      }
    }
  }
  return [...new Set(out)];
}

export function readNumber(node: JsonObject, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = flattenString(value);
    const parsed = text ? parseNumber(text) : null;
    if (parsed !== null) return parsed;
  }
  return null;
}

export function readDuration(node: JsonObject, ...keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseDuration(flattenString(node[key]));
    if (parsed !== null) return parsed;
  }
  return null;
}

/** `image` is a string, an array, or an `ImageObject`. */
export function readImage(node: JsonObject): string | null {
  const value = node.image ?? node.thumbnailUrl;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = readImageEntry(entry);
      if (found) return found;
    }
    return null;
  }
  return readImageEntry(value);
}

function readImageEntry(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (isObject(value)) {
    const url = value.url ?? value.contentUrl ?? value['@id'];
    return typeof url === 'string' ? url : null;
  }
  return null;
}

/** `recipeIngredient` (or the older `ingredients`) as raw lines. */
export function readIngredients(node: JsonObject): RawIngredientLine[] {
  const value = node.recipeIngredient ?? node.ingredients;
  const entries = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return entries
    .map((entry) => flattenString(entry))
    .filter((text): text is string => Boolean(text))
    .map((text) => ({ text }));
}

/**
 * `recipeInstructions` as raw lines.
 *
 * Four shapes exist in the wild and all four appear across these providers:
 * a plain string, an array of strings, an array of `HowToStep` (Cookomix, whose
 * `name` is a genuinely useful appliance hint), and `HowToSection` wrapping
 * nested steps.
 */
export function readInstructions(node: JsonObject): RawStepLine[] {
  return flattenInstructions(node.recipeInstructions, null);
}

function flattenInstructions(value: unknown, groupName: string | null): RawStepLine[] {
  if (typeof value === 'string') {
    return splitProse(value).map((text) => ({ text, label: null, groupName }));
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenInstructions(entry, groupName));
  }
  if (!isObject(value)) return [];

  const nodeTypes = types(value);
  if (nodeTypes.some((type) => /HowToSection/i.test(type))) {
    const name = flattenString(value.name);
    return flattenInstructions(value.itemListElement ?? value.steps, name ?? groupName);
  }

  const text = flattenString(value.text) ?? flattenString(value.name);
  if (!text) return [];

  const label = flattenString(value.name);
  return [
    {
      text,
      // Cookomix repeats the text in `name` for single-sentence steps; a label
      // identical to the text is noise, not a classification.
      label: label && label !== text ? label : null,
      groupName,
    },
  ];
}

/** A single prose blob → one step per sentence-ish line. */
function splitProse(value: string): string[] {
  return value
    .split(/\r?\n|(?<=\.)\s{2,}/)
    .map(squish)
    .filter((line) => line.length > 0);
}

/** `nutrition`, per serving, with the units stripped ("431 kcal" → 431). */
export function readNutrition(node: JsonObject): RawNutrition {
  const nutrition = isObject(node.nutrition) ? node.nutrition : {};
  return {
    // `calories` is a free-text field: "431 kcal", "1804 kJ", "188.4 kcal".
    kcal: parseEnergyKcal(readString(nutrition, 'calories', 'energyContent')),
    proteinG: readNumber(nutrition, 'proteinContent'),
    carbsG: readNumber(nutrition, 'carbohydrateContent'),
    fatG: readNumber(nutrition, 'fatContent'),
    fiberG: readNumber(nutrition, 'fiberContent'),
  };
}

export function readRating(node: JsonObject): { value: number | null; count: number | null } {
  const rating = isObject(node.aggregateRating) ? node.aggregateRating : {};
  return {
    value: readNumber(rating, 'ratingValue'),
    count: readNumber(rating, 'ratingCount', 'reviewCount'),
  };
}
