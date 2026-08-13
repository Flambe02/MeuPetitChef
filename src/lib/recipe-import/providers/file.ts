/**
 * A recipe file the cook already has — pasted or uploaded, not fetched.
 *
 * Every other provider parses a page this app fetched (Cookomix, Cookidoo) or
 * a caption an Edge Function already read into structured data (`social`).
 * This one has no page and no model call of its own: the person ran their own
 * prompt through ChatGPT/Claude/Gemini against a magazine scan or a website
 * that has no importer here, got back `schema.org/Recipe`-shaped JSON, and
 * pasted or uploaded that file directly. `jsonld.ts`'s field readers already
 * work on any schema.org-shaped JS object — `cookidoo.ts`'s
 * `fromStructuredData()` and `social.ts` both prove that — so parsing this is
 * the same six lines as `social.ts`, not a new parser.
 *
 * What is *not* built here is a Markdown grammar. A hand-rolled Markdown
 * parser would be new, untested surface for a shape with no standard to hold
 * it to; `schema.org/Recipe` is a real, widely-known format the app already
 * reads correctly, and the prompt this app hands the person asks for exactly
 * that JSON shape.
 */
import type {
  CanonicalRecipe,
  NormalizeOptions,
  ParseInput,
  RawRecipe,
  RecipeImporter,
} from '../types.ts';
import { emptyRawRecipe } from '../types.ts';
import {
  isObject,
  readDuration,
  readImage,
  readIngredients,
  readInstructions,
  readNumber,
  readNutrition,
  readString,
  readStringList,
  type JsonObject,
} from '../jsonld.ts';
import { normalizeRecipe } from '../recipe-normalizer.ts';

/** Unwraps a possible envelope (`{ recipe: {...} }`, `{ "@graph": [...] }`) around the Recipe node. */
function findRecipeObject(data: unknown): JsonObject | null {
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findRecipeObject(entry);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(data)) return null;

  const type = data['@type'];
  const isRecipe =
    (typeof type === 'string' && /Recipe/i.test(type)) ||
    (Array.isArray(type) && type.some((entry) => typeof entry === 'string' && /Recipe/i.test(entry)));
  if (isRecipe) return data;

  for (const key of ['recipe', 'recipes', 'structuredData', 'data', '@graph']) {
    const found = findRecipeObject(data[key]);
    if (found) return found;
  }
  return null;
}

export const fileImporter: RecipeImporter = {
  id: 'file',
  label: 'Arquivo (JSON)',
  // Never auto-detected from a URL — the screen forces this provider
  // explicitly the moment the pasted/uploaded text is JSON and no site
  // provider claims the (possibly absent) URL.
  hosts: [],

  canHandle(): boolean {
    return false;
  },

  externalIdFromUrl(): string | null {
    return null;
  },

  parse(input: ParseInput): Promise<RawRecipe> {
    const raw = emptyRawRecipe('file');
    raw.sourceUrl = input.url;

    const node = findRecipeObject(input.structuredData);
    if (!node) {
      // Deliberately empty rather than thrown: validation already says "no
      // title, no ingredients, no steps" in pt-BR, on the review screen.
      raw.payload = { structuredData: input.structuredData ?? null };
      return Promise.resolve(raw);
    }

    raw.title = readString(node, 'name', 'headline', 'title');
    raw.description = readString(node, 'description');
    raw.imageUrl = readImage(node);
    raw.authorName = readString(node, 'author', 'creator');
    raw.yieldText = readString(node, 'recipeYield', 'yield', 'servings');
    raw.servings = readNumber(node, 'recipeYield', 'yield', 'servings');
    raw.prepTimeSeconds = readDuration(node, 'prepTime');
    raw.cookTimeSeconds = readDuration(node, 'cookTime');
    raw.totalTimeSeconds = readDuration(node, 'totalTime');
    raw.category = readStringList(node, 'recipeCategory', 'category')[0] ?? null;
    raw.cuisine = readStringList(node, 'recipeCuisine', 'cuisine')[0] ?? null;
    raw.keywords = readStringList(node, 'keywords', 'tags');
    raw.language = readString(node, 'inLanguage', 'language');
    raw.ingredients = readIngredients(node);
    raw.steps = readInstructions(node);
    raw.nutrition = readNutrition(node);

    raw.payload = { structuredData: node };
    return Promise.resolve(raw);
  },

  normalize(raw: RawRecipe, options: NormalizeOptions): CanonicalRecipe {
    const recipe = normalizeRecipe(raw, options);

    recipe.notes = [
      ...recipe.notes,
      {
        kind: 'origem',
        title: null,
        body: 'Lida automaticamente de um arquivo enviado por você. Confira quantidades e tempos antes de cozinhar.',
      },
    ];

    return recipe;
  },
};
