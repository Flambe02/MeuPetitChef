/**
 * Cookomix — https://www.cookomix.com
 *
 * A WordPress site whose `robots.txt` allows recipe pages, and which publishes
 * a complete `schema.org/Recipe` block: ingredients, and — the part that
 * matters — every step as a typed `HowToStep` whose `name` says what kind of
 * step it is ("Programmation du Thermomix", "Mise au four"). Those names are
 * how the step normalizer knows which appliance a step belongs to without
 * guessing from prose.
 *
 * Strategy, in the brief's order:
 *
 *   A. JSON-LD                 title, times, ingredients, steps, rating
 *   B. embedded JS state       `window.recipeId` → the external id
 *   C. DOM                     full macros, the split ingredient table, the
 *                              tag chips, and the authoritative "Durée totale"
 *
 * The DOM pass only ever *adds*: if the markup changes, the import degrades to
 * whatever JSON-LD gave rather than failing.
 */
import type {
  CanonicalRecipe,
  NormalizeOptions,
  ParseInput,
  RawIngredientLine,
  RawRecipe,
  RecipeImporter,
} from '../types.ts';
import { emptyRawRecipe } from '../types.ts';
import { parseNumber, squish } from '../text.ts';
import { parseDuration } from '../duration.ts';
import {
  extractJsonLd,
  findRecipeNode,
  readDuration,
  readImage,
  readIngredients,
  readInstructions,
  readNumber,
  readNutrition,
  readRating,
  readString,
  readStringList,
} from '../jsonld.ts';
import { normalizeRecipe } from '../recipe-normalizer.ts';

const HOSTS = ['cookomix.com', 'www.cookomix.com'];

/** The `dl` blocks Cookomix uses for meta, read as label → value pairs. */
function readDefinitionList(root: Element | null): Map<string, string> {
  const pairs = new Map<string, string>();
  if (!root) return pairs;

  const terms = [...root.children];
  let label: string | null = null;
  for (const child of terms) {
    if (child.tagName === 'DT') {
      label = squish(child.textContent ?? '');
    } else if (child.tagName === 'DD' && label) {
      // First definition wins: Cookomix repeats "Coût" with a detail row.
      if (!pairs.has(label)) pairs.set(label, squish(child.textContent ?? ''));
      label = null;
    }
  }
  return pairs;
}

/** Finds a value by matching the start of its label, accent-insensitively. */
function pick(pairs: Map<string, string>, ...labels: string[]): string | null {
  for (const [key, value] of pairs) {
    const folded = key
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    if (labels.some((label) => folded.startsWith(label))) return value;
  }
  return null;
}

/**
 * `dl.ingredients` — `<dt>500 grammes</dt><dd><a>Crème fraîche épaisse</a></dd>`.
 *
 * Preferred over the JSON-LD "Name - amount" strings: the split is the site's
 * own, so no separator heuristic can get it wrong.
 */
function readIngredientTable(document: Document): RawIngredientLine[] {
  const list = document.querySelector('dl.ingredients');
  if (!list) return [];

  const lines: RawIngredientLine[] = [];
  let amount: string | null = null;
  for (const child of [...list.children]) {
    if (child.tagName === 'DT') {
      amount = squish(child.textContent ?? '');
    } else if (child.tagName === 'DD') {
      const name = squish(child.textContent ?? '');
      if (name) {
        lines.push({ text: `${name} - ${amount ?? ''}`.trim(), name, amountText: amount });
      }
      amount = null;
    }
  }
  return lines;
}

function readExternalId(document: Document, html: string | null): string | null {
  const fromScript = html ? /window\.recipeId\s*=\s*(\d+)/.exec(html)?.[1] : null;
  if (fromScript) return fromScript;

  const fromStars = document
    .querySelector('.ec-stars-wrapper-display[data-post-id]')
    ?.getAttribute('data-post-id');
  if (fromStars) return fromStars;

  const fromContainer = /^recipe-(\d+)$/.exec(
    document.querySelector('[id^="recipe-"]')?.id ?? '',
  )?.[1];
  return fromContainer ?? null;
}

export const cookomixImporter: RecipeImporter = {
  id: 'cookomix',
  label: 'Cookomix',
  hosts: HOSTS,

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return HOSTS.includes(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  },

  externalIdFromUrl(): string | null {
    // Cookomix URLs carry a slug, not the numeric post id. It comes from the
    // page instead (`window.recipeId`).
    return null;
  },

  parse(input: ParseInput): Promise<RawRecipe> {
    const raw = emptyRawRecipe('cookomix');
    raw.sourceUrl = input.url;
    raw.language = 'fr-FR';

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
      // Cookomix publishes the *total* in `cookTime` and repeats it in the page
      // as "Durée totale"; adding prep to it would over-report every recipe by
      // its prep time. `cookTimeSeconds` is therefore left null on purpose.
      raw.totalTimeSeconds = readDuration(node, 'totalTime') ?? readDuration(node, 'cookTime');
      raw.category = readStringList(node, 'recipeCategory')[0] ?? null;
      raw.cuisine = readStringList(node, 'recipeCuisine')[0] ?? null;
      raw.keywords = readStringList(node, 'keywords');
      raw.ingredients = readIngredients(node);
      raw.steps = readInstructions(node);
      raw.nutrition = readNutrition(node);

      const rating = readRating(node);
      raw.ratingValue = rating.value;
      raw.ratingCount = rating.count;
    }

    if (document) {
      raw.externalId = readExternalId(document, input.html ?? null);

      // Same rule as Cookidoo: the table's own split beats parsing the JSON-LD
      // strings, but never at the cost of losing a line.
      const table = readIngredientTable(document);
      if (table.length >= raw.ingredients.length && table.length > 0) raw.ingredients = table;

      const meta = readDefinitionList(document.querySelector('dl.basic.prez'));
      const user = readDefinitionList(document.querySelector('dl.basic.user'));

      raw.difficultyText = pick(meta, 'difficulte') ?? raw.difficultyText;
      raw.deviceText = pick(user, 'recette pour');

      const total = parseDuration(pick(meta, 'duree totale', 'temps total'));
      if (total !== null) raw.totalTimeSeconds = total;
      const prep = parseDuration(pick(meta, 'preparation'));
      if (prep !== null) raw.prepTimeSeconds = prep;

      const servings = parseNumber(pick(meta, 'nombre de parts', 'portions') ?? '');
      if (servings !== null) {
        raw.servings = servings;
        raw.yieldText = pick(meta, 'nombre de parts', 'portions');
      }

      // The page carries the full macro breakdown; the JSON-LD only carries
      // calories. Per portion in both cases.
      raw.nutrition = {
        kcal: parseNumber(pick(meta, 'calories par portion') ?? '') ?? raw.nutrition.kcal,
        proteinG: parseNumber(pick(meta, 'proteines') ?? '') ?? raw.nutrition.proteinG,
        carbsG: parseNumber(pick(meta, 'glucides') ?? '') ?? raw.nutrition.carbsG,
        fatG: parseNumber(pick(meta, 'lipides') ?? '') ?? raw.nutrition.fatG,
        fiberG: parseNumber(pick(meta, 'fibres') ?? '') ?? raw.nutrition.fiberG,
      };

      const themes = [...document.querySelectorAll('.recipe-themes a.recipe-theme')].map((anchor) =>
        squish(anchor.textContent ?? ''),
      );
      if (themes.length > 0) raw.keywords = [...new Set([...raw.keywords, ...themes])];

      if (!raw.title) {
        raw.title = squish(document.querySelector('h1.entry-title')?.textContent ?? '') || null;
      }
    }

    raw.payload = {
      jsonLd: node,
      externalId: raw.externalId,
      device: raw.deviceText,
    };

    return Promise.resolve(raw);
  },

  normalize(raw: RawRecipe, options: NormalizeOptions): CanonicalRecipe {
    const recipe = normalizeRecipe(raw, options);
    // Cookomix is a Thermomix site: "Recette pour Thermomix TM31, TM5, TM6 et
    // TM7" is worth keeping as a note, since it is the only place the model
    // compatibility is stated.
    if (raw.deviceText) {
      recipe.notes = [...recipe.notes, { kind: 'tip', title: 'Aparelho', body: raw.deviceText }];
    }
    return recipe;
  },
};
