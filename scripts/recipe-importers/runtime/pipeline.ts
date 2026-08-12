/**
 * One import, end to end — the routine both CLIs call.
 *
 *   fetch (or read a file) → parse → normalize → validate → [dedupe → save]
 *
 * Saving is opt-in. The default is a preview, because an importer that writes
 * on sight will eventually write four hundred half-parsed recipes into the
 * catalogue before anyone notices.
 */
import { readFile } from 'node:fs/promises';

import type { ProviderId } from '../../../src/lib/recipe-import/types.ts';
import { runImport, type ImportOutcome } from '../../../src/lib/recipe-import/registry.ts';
import {
  findDuplicate,
  recordImport,
  saveImportedRecipe,
  type DuplicateMatch,
} from '../../../src/lib/recipe-import/persist.ts';
import { parseHtml } from './dom.ts';
import { fetchPage, FetchRefused, type FetchOptions } from './fetcher.ts';
import type { Logger } from './log.ts';
import type { ImportState } from './report.ts';
import { createImportClient, importUserId, type ImportClient } from './supabase.ts';

export interface ImportOneOptions {
  url?: string | null;
  /** A page the user saved, or a JSON export. Skips the network entirely. */
  file?: string | null;
  provider?: ProviderId | null;
  servings?: number | undefined;
  save: boolean;
  /** Saves even when an earlier import of the same recipe exists. */
  force: boolean;
  logger: Logger;
  fetchOptions?: FetchOptions;
  /** Reused across a batch so one client serves every URL. */
  client?: ImportClient | null;
}

export interface ImportOneResult {
  outcome: ImportOutcome;
  state: ImportState;
  duplicate: DuplicateMatch | null;
  savedRecipe: { id: string; slug: string } | null;
  importId: string | null;
}

/** A file whose contents are JSON is mode 3; anything else is treated as HTML. */
function readSource(contents: string): { html: string | null; structuredData: unknown } {
  const trimmed = contents.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { html: null, structuredData: JSON.parse(contents) };
    } catch {
      // Falls through: a page can legitimately start with a brace in a script.
    }
  }
  return { html: contents, structuredData: undefined };
}

export async function importOne(options: ImportOneOptions): Promise<ImportOneResult> {
  const { logger } = options;

  logger.stage('IMPORT', {
    provider: options.provider ?? 'auto',
    url: options.url ?? undefined,
    file: options.file ?? undefined,
  });

  let html: string | null;
  let structuredData: unknown;

  if (options.file) {
    const contents = await readFile(options.file, 'utf8');
    const source = readSource(contents);
    html = source.html;
    structuredData = source.structuredData;
    logger.stage('FETCH', { OK: true, source: 'file', bytes: contents.length });
  } else if (options.url) {
    const page = await fetchPage(options.url, {
      ...options.fetchOptions,
      onRetry: (attempt, waitMs, reason) =>
        logger.stage('FETCH', { retry: attempt, wait_ms: waitMs, reason }),
    });
    html = page.html;
    logger.stage('FETCH', { OK: true, status: page.status, bytes: page.html.length });
  } else {
    throw new Error('Informe uma URL ou --file.');
  }

  const outcome = await runImport({
    ...(options.provider ? { provider: options.provider } : {}),
    url: options.url ?? null,
    html,
    structuredData,
    parseHtml,
    ...(options.servings === undefined ? {} : { servings: options.servings }),
  });

  logger.stage('PARSE', {
    ingredients: outcome.summary.ingredients,
    steps: outcome.summary.steps,
    thermomix_steps: outcome.summary.thermomixSteps,
    parameters: outcome.summary.stepsWithParameters,
  });
  logger.stage('NORMALIZE', {
    warnings: outcome.validation.warnings.length,
    errors: outcome.validation.errors.length,
  });

  const result: ImportOneResult = {
    outcome,
    state: outcome.validation.ok ? 'READY FOR REVIEW' : 'NEEDS ATTENTION',
    duplicate: null,
    savedRecipe: null,
    importId: null,
  };

  if (!options.save) return result;

  const client = options.client ?? createImportClient();

  const duplicate = await findDuplicate(client, outcome.recipe);
  result.duplicate = duplicate;
  if (duplicate && !options.force) {
    logger.stage('SAVE', { skipped: 'duplicate', reason: duplicate.reason });
    result.state = 'DUPLICATE';
    return result;
  }

  const userId = importUserId();
  result.importId = await recordImport(client, {
    userId,
    recipe: outcome.recipe,
    rawPayload: outcome.raw.payload,
    validation: outcome.validation,
  });

  if (!outcome.validation.ok) {
    // The import row is kept — with its raw payload — so the parse can be
    // replayed after a fix. The recipe itself is not written.
    logger.stage('SAVE', { import_id: result.importId, recipe: 'skipped (validation)' });
    return result;
  }

  result.savedRecipe = await saveImportedRecipe(client, {
    recipe: outcome.recipe,
    userId,
    importId: result.importId,
  });
  result.state = 'SAVED';
  logger.stage('SAVE', {
    import_id: result.importId,
    recipe_id: result.savedRecipe.id,
    slug: result.savedRecipe.slug,
  });

  return result;
}

export { FetchRefused };
