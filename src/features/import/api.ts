/**
 * Repository for the import screen.
 *
 * The parsing itself lives in `@/lib/recipe-import` and is shared verbatim with
 * the CLI — the screen is a second front end onto the same pipeline, not a
 * second implementation of it.
 *
 * One deliberate limitation shapes this file: a browser cannot fetch
 * cookomix.com or cookidoo.fr. Neither site sends CORS headers, so a
 * `fetch()` from the app is refused before it leaves the tab. The screen
 * therefore analyses a page the user pastes (or a JSON export), and the CLI
 * — which has no such restriction — is what fetches by URL.
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

export type { ImportOutcome, DuplicateMatch };

export interface AnalyzeInput {
  /** Optional. Used to detect the provider and to record where it came from. */
  url: string;
  /** The page source, or a JSON export. */
  source: string;
  provider?: ProviderId;
}

/** In the browser the DOM is free; the CLI hands jsdom's in instead. */
const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');

function isJson(source: string): boolean {
  const trimmed = source.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/**
 * Parses, normalizes and validates — and writes nothing.
 *
 * Saving is a second, explicit call, because the whole point of the review
 * screen is that a human sees the recipe before it exists.
 */
export async function analyzeImport(input: AnalyzeInput): Promise<ImportOutcome> {
  const url = input.url.trim();
  const source = input.source.trim();

  const provider = input.provider ?? (url ? detectProvider(url)?.id : undefined);
  if (!provider) {
    throw new DataError(
      'Não reconhecemos essa fonte. Cole o endereço de uma receita do Cookomix ou do Cookidoo, ou escolha o provedor.',
    );
  }
  if (!source) {
    throw new DataError(
      'Cole o conteúdo da página (Ctrl+U → copiar tudo) ou um arquivo JSON exportado.',
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
