/**
 * Instagram and Facebook — a caption, read into a recipe.
 *
 * Every other provider parses a *document*: the site publishes `schema.org/
 * Recipe`, and the importer reads fields out of it. A social post publishes no
 * such thing. What it publishes is a caption — prose, sometimes with a list of
 * ingredients, sometimes with the quantities in the video and not in the text
 * at all. No selector can parse that, and pretending otherwise would produce
 * confident nonsense.
 *
 * So the reading happens in the `import-recipe` Edge Function, where the model
 * turns the caption into a `schema.org/Recipe` object, and this importer parses
 * that object exactly as it would parse one served by a site. Two consequences
 * worth stating:
 *
 *   * the whole pipeline downstream is unchanged — the same normalizer infers
 *     the appliance, the same duration parser fills the timers, the same
 *     validator refuses a recipe with no ingredients, and the same fingerprint
 *     catches a re-import;
 *   * what the model produced is *validated*, not trusted. A caption that is
 *     not a recipe fails validation here like any other bad import.
 *
 * The model is instructed to extract and never to invent. It is not asked to
 * translate either: an import keeps the source's language until the explicit
 * pt-BR adaptation pass, exactly as for Cookomix (see docs §2).
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

export type SocialNetwork = 'instagram' | 'facebook';

/**
 * Host patterns, anchored on the registrable domain.
 *
 * `endsWith('instagram.com')` would also accept `evil-instagram.com`, which is
 * how allowlists usually leak. The leading `(^|\.)` makes the match a label
 * boundary instead of a substring.
 */
const HOSTS: Record<SocialNetwork, RegExp> = {
  instagram: /(^|\.)instagram\.com$/i,
  facebook: /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/i,
};

/** Post shapes that carry an id worth deduplicating on. */
const POST_PATHS: Record<SocialNetwork, RegExp[]> = {
  instagram: [/\/(?:p|reel|reels|tv)\/([\w-]+)/i],
  facebook: [
    /\/share\/(?:p|r|v)\/([\w-]+)/i,
    /\/(?:reel|videos|posts)\/([\w.-]+)/i,
    /\/permalink\/(\d+)/i,
    /^\/([\w-]{6,})\/?$/i, // fb.watch/<token>
  ],
};

export function socialNetworkOf(url: string): SocialNetwork | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [network, pattern] of Object.entries(HOSTS) as [SocialNetwork, RegExp][]) {
    if (pattern.test(host)) return network;
  }
  return null;
}

/** Human label for the review screen: "Instagram", not "social". */
export function socialLabel(url: string): string | null {
  const network = socialNetworkOf(url);
  if (!network) return null;
  return network === 'instagram' ? 'Instagram' : 'Facebook';
}

/**
 * `instagram:C8xY_1aB2` — the network stays inside the id.
 *
 * Deduplication is `(provider, external_id)`, and two networks can perfectly
 * well mint the same opaque token. Prefixing keeps one namespace per network
 * without a second provider.
 */
export function socialExternalId(url: string): string | null {
  const network = socialNetworkOf(url);
  if (!network) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  for (const pattern of POST_PATHS[network]) {
    const found = pattern.exec(pathname)?.[1];
    if (found) return `${network}:${found}`;
  }
  return null;
}

/** Unwraps the envelope the Edge Function returns (`{ recipe: {...} }`). */
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

  for (const key of ['recipe', 'structuredData', 'data', '@graph']) {
    const found = findRecipeObject(data[key]);
    if (found) return found;
  }
  return null;
}

export const socialImporter: RecipeImporter = {
  id: 'social',
  label: 'Instagram / Facebook',
  hosts: ['instagram.com', 'facebook.com', 'fb.watch'],

  canHandle(url: string): boolean {
    return socialNetworkOf(url) !== null;
  },

  externalIdFromUrl(url: string): string | null {
    return socialExternalId(url);
  },

  parse(input: ParseInput): Promise<RawRecipe> {
    const raw = emptyRawRecipe('social');
    raw.sourceUrl = input.url;
    raw.externalId = input.url ? socialExternalId(input.url) : null;

    const node = findRecipeObject(input.structuredData);
    if (!node) {
      // Deliberately empty rather than thrown: validation already says "no
      // title, no ingredients, no steps" in pt-BR, on the review screen, where
      // the person can act on it.
      raw.payload = { structuredData: input.structuredData ?? null };
      return Promise.resolve(raw);
    }

    raw.title = readString(node, 'name', 'headline');
    raw.description = readString(node, 'description');
    raw.imageUrl = readImage(node);
    raw.authorName = readString(node, 'author', 'creator');
    raw.yieldText = readString(node, 'recipeYield');
    raw.servings = readNumber(node, 'recipeYield');
    raw.prepTimeSeconds = readDuration(node, 'prepTime');
    raw.cookTimeSeconds = readDuration(node, 'cookTime');
    raw.totalTimeSeconds = readDuration(node, 'totalTime');
    raw.category = readStringList(node, 'recipeCategory')[0] ?? null;
    raw.cuisine = readStringList(node, 'recipeCuisine')[0] ?? null;
    raw.keywords = readStringList(node, 'keywords');
    raw.language = readString(node, 'inLanguage');
    raw.ingredients = readIngredients(node);
    raw.steps = readInstructions(node);
    raw.nutrition = readNutrition(node);

    raw.payload = { structuredData: node };
    return Promise.resolve(raw);
  },

  normalize(raw: RawRecipe, options: NormalizeOptions): CanonicalRecipe {
    const recipe = normalizeRecipe(raw, options);

    // Where the words came from, on the recipe itself. Someone reading this
    // draft in six months should not have to remember that a caption was read
    // by a model — nothing else in the row says so.
    const network = raw.sourceUrl ? socialLabel(raw.sourceUrl) : null;
    recipe.notes = [
      ...recipe.notes,
      {
        kind: 'origem',
        title: null,
        body: network
          ? `Lida automaticamente da legenda de um post do ${network}. Confira quantidades e tempos antes de cozinhar.`
          : 'Lida automaticamente de um texto colado. Confira quantidades e tempos antes de cozinhar.',
      },
    ];

    return recipe;
  },
};
