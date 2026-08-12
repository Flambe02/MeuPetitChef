/**
 * Repository for the import screen.
 *
 * The parsing itself lives in `@/lib/recipe-import` and is shared verbatim with
 * the CLI — the screen is a second front end onto the same pipeline, not a
 * second implementation of it.
 *
 * The limitation that used to shape this file is gone. A browser still cannot
 * fetch cookomix.com or instagram.com — no CORS headers, so the request is
 * refused before it leaves the tab — but it no longer has to: the
 * `import-recipe` Edge Function fetches server-side and hands back the page, or
 * for a social post the caption already read into a `schema.org/Recipe`. A URL
 * is therefore enough. Pasting a page's source still works, and is still the
 * answer for a Cookidoo page only a subscriber can see.
 */
import type { RecipeImport } from '@/domain/types';
import { supabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/supabase/errors';
import { DataError } from '@/lib/supabase/errors';
import { detectProvider, runImport, type ImportOutcome } from '@/lib/recipe-import/registry';
import {
  findDuplicate,
  recordImport,
  saveImportedRecipe,
  type DuplicateMatch,
} from '@/lib/recipe-import/persist';
import type { ProviderId } from '@/lib/recipe-import/types';
import { fetchSource } from './fetch-source';

export type { ImportOutcome, DuplicateMatch };

export interface AnalyzeInput {
  /** On its own, this is now enough: the Edge Function fetches it. */
  url: string;
  /** Optional. A page source, a JSON export, or a caption copied by hand. */
  source: string;
  /** Screenshots of a post, as data URLs, in reading order. */
  images?: string[];
  provider?: ProviderId;
}

/** In the browser the DOM is free; the CLI hands jsdom's in instead. */
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');

function isJson(source: string): boolean {
  const trimmed = source.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/** Markup, rather than a caption someone copied out of a post. */
function isHtml(source: string): boolean {
  return /<\s*(!doctype|html|head|body|div|script|meta|article)\b/i.test(source);
}

/**
 * Parses, normalizes and validates — and writes nothing.
 *
 * Saving is a second, explicit call, because the whole point of the review
 * screen is that a human sees the recipe before it exists.
 *
 * Four ways in, in the order the screen offers them:
 *
 *   1. **a URL alone** — fetched by the Edge Function. A recipe site comes back
 *      as HTML and is parsed here; a social post comes back already read into a
 *      `schema.org/Recipe`.
 *   2. **screenshots** — prints of a post, read the same way. Checked first:
 *      someone who took captures took them *because* the link would not open,
 *      so falling back to fetching would answer a question already given up on.
 *   3. **pasted markup or JSON** — parsed locally, exactly as before. Still the
 *      answer for a Cookidoo page only its subscriber can open.
 *   4. **pasted prose** — a caption copied out of a post that would not open.
 *      There is nothing to parse in prose, so it takes the same reading pass a
 *      fetched caption does.
 */
export async function analyzeImport(input: AnalyzeInput): Promise<ImportOutcome> {
  const url = input.url.trim();
  const source = input.source.trim();
  const images = input.images ?? [];

  if (images.length > 0) {
    const fetched = await fetchSource({ images, ...(source ? { text: source } : {}), url });
    return withSourceWarnings(
      await runImport({
        provider: fetched.provider,
        url: url || null,
        structuredData: fetched.structuredData,
        parseHtml,
      }),
      fetched.missing,
    );
  }

  if (!source) {
    if (!url) {
      throw new DataError('Cole o endereço da receita, o texto dela, ou envie capturas de tela.');
    }
    const fetched = await fetchSource({ url });
    return withSourceWarnings(
      await runImport({
        provider: fetched.provider,
        url: fetched.finalUrl ?? url,
        html: fetched.html,
        structuredData: fetched.structuredData,
        parseHtml,
      }),
      fetched.missing,
    );
  }

  const provider = input.provider ?? (url ? detectProvider(url)?.id : undefined);

  // Prose: no markup to walk, no JSON to read. The reading pass is the only
  // thing that can turn it into a recipe, and it is also what makes a private
  // post importable at all — copy the caption, paste it here.
  if (!isJson(source) && !isHtml(source)) {
    const fetched = await fetchSource({ text: source });
    return withSourceWarnings(
      await runImport({
        provider: fetched.provider,
        url: url || null,
        structuredData: fetched.structuredData,
        parseHtml,
      }),
      fetched.missing,
    );
  }

  if (!provider) {
    throw new DataError(
      'Não reconhecemos essa fonte. Cole o endereço de uma receita do Cookomix, do Cookidoo, ' +
        'do Instagram ou do Facebook, ou escolha o provedor.',
    );
  }

  let structuredData: unknown;
  let html: string | null = source;
  if (isJson(source)) {
    try {
      structuredData = JSON.parse(source);
      html = null;
    } catch {
      throw new DataError('O JSON colado não é válido.');
    }
  }

  return runImport({
    provider,
    url: url || null,
    html,
    structuredData,
    parseHtml,
  });
}

/**
 * What the source did not say, carried through as warnings.
 *
 * The reading pass reports its own gaps ("quantidades", "tempo de forno"), and
 * they belong next to the validator's warnings rather than in a channel of
 * their own: for the person reviewing, "no quantities in the caption" and
 * "quantity failed to parse" are the same kind of thing to check.
 */
function withSourceWarnings(outcome: ImportOutcome, missing: string[]): ImportOutcome {
  if (missing.length === 0) return outcome;
  return {
    ...outcome,
    validation: {
      ...outcome.validation,
      warnings: [
        ...outcome.validation.warnings,
        ...missing.map((item) => ({
          code: 'source_missing',
          message: `A fonte não informa: ${item}.`,
        })),
      ],
    },
  };
}

/** Checks whether this recipe was already imported, before offering to save. */
export function checkDuplicate(outcome: ImportOutcome): Promise<DuplicateMatch | null> {
  return findDuplicate(supabase, outcome.recipe);
}

/**
 * Writes the import row and, when validation passed, the draft recipe.
 *
 * The draft belongs to the caller: RLS (migration 12) accepts a `recipes`
 * insert only when `created_by = auth.uid()` and `status = 'draft'`, which is
 * exactly what an unreviewed import should be.
 */
export async function saveImport(
  userId: string,
  outcome: ImportOutcome,
): Promise<{ id: string; slug: string } | null> {
  const importId = await recordImport(supabase, {
    userId,
    recipe: outcome.recipe,
    rawPayload: outcome.raw.payload,
    validation: outcome.validation,
  });

  if (!outcome.validation.ok) return null;

  return saveImportedRecipe(supabase, { recipe: outcome.recipe, userId, importId });
}

/** The caller's import queue, newest first. */
export async function listImports(userId: string): Promise<RecipeImport[]> {
  return unwrap(
    await supabase
      .from('recipe_imports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  );
}
