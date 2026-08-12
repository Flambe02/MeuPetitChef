/**
 * Cookidoo — https://cookidoo.<tld>
 *
 * Vorwerk's own platform, and a partly closed one. Verified against the live
 * public pages:
 *
 *   * a public recipe page *does* serve `schema.org/Recipe` JSON-LD with the
 *     name, times, yield, ingredients and nutrition, and the DOM repeats them
 *     in `<recipe-ingredient>` / `<rdp-nutritious>` custom elements;
 *   * it does **not** serve `recipeInstructions`. The preparation steps are
 *     part of the subscription, and the page does not contain them at all —
 *     there is no scrollspy entry for them and no hidden markup.
 *
 * So this importer has three inputs, and none of them work around that:
 *
 *   1. a public URL          → everything except the steps (import is flagged)
 *   2. an HTML file the user saved from their own logged-in browser session
 *   3. a JSON file (schema.org Recipe, or a raw payload we exported earlier)
 *
 * Modes 2 and 3 are also the contract a future browser extension would post to
 * (`{ url, html, structuredData }`), which is why `parse` treats them as the
 * same thing rather than as a special case.
 *
 * No credential handling, no session replay, no private endpoints: if the user
 * is entitled to see a page, they can save it; if they are not, this importer
 * says so and stops.
 */
import type {
  CanonicalRecipe,
  NormalizeOptions,
  ParseInput,
  RawIngredientLine,
  RawRecipe,
  RawStepLine,
  RecipeImporter,
} from '../types.ts';
import { emptyRawRecipe } from '../types.ts';
import { fold, parseNumber, squish } from '../text.ts';
import { parseEnergyKcal } from '../units.ts';
import {
  extractJsonLd,
  findRecipeNode,
  isObject,
  readDuration,
  readImage,
  readIngredients,
  readInstructions,
  readNumber,
  readNutrition,
  readRating,
  readString,
  readStringList,
  type JsonObject,
} from '../jsonld.ts';
import { normalizeRecipe } from '../recipe-normalizer.ts';

/** `/recipes/recipe/<locale>/<id>` — the shape every Cookidoo locale uses. */
const RECIPE_PATH = /\/recipes?\/recipe\/([a-z]{2}(?:-[A-Z]{2})?)\/(r?\d+[\w-]*)/i;

/**
 * Where the preparation steps live once a subscriber saves the page.
 *
 * Ordered by confidence. The first two follow the naming the public page
 * already uses for every other section (`recipe-ingredient`,
 * `#ingredients-section`), the rest are progressively looser fallbacks. This
 * list is a heuristic and is documented as one — it could not be verified
 * against a logged-in page, and it must not be trusted enough to invent a step
 * that is not there.
 */
const STEP_SELECTORS = [
  '#preparation-section recipe-step',
  'recipe-step',
  '[data-test-id="recipe-step"]',
  '#preparation-section li',
  '.recipe-preparation-steps li',
];

function readSteps(document: Document): RawStepLine[] {
  for (const selector of STEP_SELECTORS) {
    const nodes = [...document.querySelectorAll(selector)];
    const lines = nodes
      .map((node) => squish(node.textContent ?? ''))
      .filter((text) => text.length > 3)
      .map((text): RawStepLine => ({ text, label: null }));
    if (lines.length > 0) return lines;
  }

  // Last resort: an ordered list under a heading that says "preparation" in one
  // of Cookidoo's locales.
  for (const heading of document.querySelectorAll('h1, h2, h3, h4')) {
    if (
      !/prepara|zubereitung|preparation|modo de preparo|bereiding/.test(
        fold(heading.textContent ?? ''),
      )
    ) {
      continue;
    }
    const list = heading.parentElement?.querySelector('ol, ul');
    const lines = [...(list?.querySelectorAll('li') ?? [])]
      .map((item) => squish(item.textContent ?? ''))
      .filter((text) => text.length > 3)
      .map((text): RawStepLine => ({ text, label: null }));
    if (lines.length > 0) return lines;
  }

  return [];
}

/** `<recipe-ingredient>` — name, amount and the "alternative" line. */
function readIngredientElements(document: Document): RawIngredientLine[] {
  return [...document.querySelectorAll('recipe-ingredient')]
    .map((element): RawIngredientLine => {
      const name = squish(element.querySelector('.recipe-ingredient__name')?.textContent ?? '');
      const amount = squish(element.querySelector('.recipe-ingredient__amount')?.textContent ?? '');
      const alternative = squish(
        element.querySelector('.recipe-ingredient__alternative')?.textContent ?? '',
      );
      return {
        text: squish(`${amount} ${name}`) || squish(element.textContent ?? ''),
        name: name || null,
        amountText: amount || null,
        alternativeText: alternative || null,
      };
    })
    .filter((line) => line.text.length > 0);
}

/** `<rdp-nutritious>` — the per-serving macros, labelled in the page language. */
function readNutritionElements(document: Document) {
  const values = new Map<string, string>();
  for (const item of document.querySelectorAll('.rdp-nutritious__item')) {
    const name = fold(item.querySelector('.rdp-nutritious__name')?.textContent ?? '');
    const value = squish(item.querySelector('.rdp-nutritious__value')?.textContent ?? '');
    if (name) values.set(name, value);
  }

  const raw = (...prefixes: string[]): string | null => {
    for (const [name, value] of values) {
      if (prefixes.some((prefix) => name.startsWith(prefix))) return value;
    }
    return null;
  };
  const find = (...prefixes: string[]) => parseNumber(raw(...prefixes) ?? '');

  return {
    // "788.3 kJ / 188.4 kcal" — both units in one string.
    kcal: parseEnergyKcal(raw('calor', 'energ', 'kcal', 'brennwert')),
    proteinG: find('protein', 'proteina', 'proteines', 'eiweiss'),
    carbsG: find('carb', 'glucid', 'kohlenhydrat'),
    fatG: find('fat', 'lipid', 'gordura', 'fett'),
    fiberG: find('fib', 'ballaststoff'),
  };
}

/** Reads a schema.org Recipe object handed over as JSON (mode 3). */
function fromStructuredData(raw: RawRecipe, data: unknown): boolean {
  const node = findStructuredRecipe(data);
  if (!node) return false;

  raw.title = readString(node, 'name') ?? raw.title;
  raw.description = readString(node, 'description') ?? raw.description;
  raw.imageUrl = readImage(node) ?? raw.imageUrl;
  raw.authorName = readString(node, 'author') ?? raw.authorName;
  raw.yieldText = readString(node, 'recipeYield') ?? raw.yieldText;
  raw.servings = readNumber(node, 'recipeYield') ?? raw.servings;
  raw.prepTimeSeconds = readDuration(node, 'prepTime') ?? raw.prepTimeSeconds;
  raw.cookTimeSeconds = readDuration(node, 'cookTime') ?? raw.cookTimeSeconds;
  raw.totalTimeSeconds = readDuration(node, 'totalTime') ?? raw.totalTimeSeconds;
  raw.category = readStringList(node, 'recipeCategory')[0] ?? raw.category;
  raw.cuisine = readStringList(node, 'recipeCuisine')[0] ?? raw.cuisine;
  raw.language = readString(node, 'inLanguage') ?? raw.language;

  const keywords = readStringList(node, 'keywords');
  if (keywords.length > 0) raw.keywords = keywords;

  const ingredients = readIngredients(node);
  if (ingredients.length > 0) raw.ingredients = ingredients;

  const steps = readInstructions(node);
  if (steps.length > 0) raw.steps = steps;

  const nutrition = readNutrition(node);
  if (Object.values(nutrition).some((value) => value !== null)) raw.nutrition = nutrition;

  const rating = readRating(node);
  raw.ratingValue = rating.value ?? raw.ratingValue;
  raw.ratingCount = rating.count ?? raw.ratingCount;
  return true;
}

/** Unwraps the common envelopes a JSON export arrives in. */
function findStructuredRecipe(data: unknown): JsonObject | null {
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findStructuredRecipe(entry);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(data)) return null;

  const type = data['@type'];
  const isRecipe =
    (typeof type === 'string' && /Recipe/i.test(type)) ||
    (Array.isArray(type) &&
      type.some((entry) => typeof entry === 'string' && /Recipe/i.test(entry)));
  if (isRecipe) return data;

  for (const key of ['recipe', 'structuredData', 'data', '@graph']) {
    const found = findStructuredRecipe(data[key]);
    if (found) return found;
  }
  return null;
}

export const cookidooImporter: RecipeImporter = {
  id: 'cookidoo',
  label: 'Cookidoo',
  hosts: ['cookidoo.international', 'cookidoo.com.br', 'cookidoo.fr', 'cookidoo.de'],

  canHandle(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === 'cookidoo' || host.startsWith('cookidoo.') || host.endsWith('.cookidoo.com');
    } catch {
      return false;
    }
  },

  externalIdFromUrl(url: string): string | null {
    try {
      return RECIPE_PATH.exec(new URL(url).pathname)?.[2] ?? null;
    } catch {
      return null;
    }
  },

  parse(input: ParseInput): Promise<RawRecipe> {
    const raw = emptyRawRecipe('cookidoo');
    raw.sourceUrl = input.url;

    if (input.url) {
      const match = RECIPE_PATH.exec(input.url);
      raw.externalId = match?.[2] ?? null;
      raw.language = match?.[1] ?? null;
    }

    const document = input.document ?? null;
    const node = document ? findRecipeNode(extractJsonLd(document)) : null;

    if (node) {
      raw.title = readString(node, 'name');
      raw.description = readString(node, 'description');
      raw.imageUrl = readImage(node);
      raw.authorName = readString(node, 'author');
      raw.yieldText = readString(node, 'recipeYield');
      raw.servings = readNumber(node, 'recipeYield');
      raw.prepTimeSeconds = readDuration(node, 'prepTime');
      raw.cookTimeSeconds = readDuration(node, 'cookTime');
      raw.totalTimeSeconds = readDuration(node, 'totalTime');
      raw.category = readStringList(node, 'recipeCategory')[0] ?? null;
      raw.cuisine = readStringList(node, 'recipeCuisine')[0] ?? null;
      raw.keywords = readStringList(node, 'keywords');
      raw.ingredients = readIngredients(node);
      raw.steps = readInstructions(node);
      raw.nutrition = readNutrition(node);
      raw.language ??= readString(node, 'inLanguage');

      const rating = readRating(node);
      raw.ratingValue = rating.value;
      raw.ratingCount = rating.count;
    }

    if (document) {
      // The DOM splits name from amount, which beats parsing "100 g Salz" —
      // but only when it is at least as complete as the JSON-LD list. A page
      // that lazy-renders half its ingredients must not shrink the recipe.
      const elements = readIngredientElements(document);
      if (elements.length >= raw.ingredients.length && elements.length > 0) {
        raw.ingredients = elements;
      }

      // Only ever *adds* steps: the public page has none, a saved page has them.
      if (raw.steps.length === 0) raw.steps = readSteps(document);

      const difficulty = squish(document.querySelector('rdp-difficulty p')?.textContent ?? '');
      if (difficulty) raw.difficultyText = difficulty;

      const macros = readNutritionElements(document);
      if (Object.values(macros).some((value) => value !== null)) {
        raw.nutrition = {
          kcal: macros.kcal ?? raw.nutrition.kcal,
          proteinG: macros.proteinG ?? raw.nutrition.proteinG,
          carbsG: macros.carbsG ?? raw.nutrition.carbsG,
          fatG: macros.fatG ?? raw.nutrition.fatG,
          fiberG: macros.fiberG ?? raw.nutrition.fiberG,
        };
      }
    }

    // Mode 3 wins over the page: a JSON export is the user's own complete copy.
    const usedStructured = input.structuredData
      ? fromStructuredData(raw, input.structuredData)
      : false;

    raw.payload = { jsonLd: node, structuredData: usedStructured ? input.structuredData : null };
    return Promise.resolve(raw);
  },

  normalize(raw: RawRecipe, options: NormalizeOptions): CanonicalRecipe {
    const recipe = normalizeRecipe(raw, options);
    // Every Cookidoo recipe is a Thermomix recipe, even when a partial import
    // produced no step to prove it. Saying so on the path keeps the review
    // screen honest about what was actually imported.
    if (recipe.paths[0] && recipe.paths[0].steps.length === 0) {
      recipe.paths[0].name = 'Thermomix';
      recipe.paths[0].reason = 'Passos não disponíveis na página pública do Cookidoo.';
    }
    return recipe;
  },
};
