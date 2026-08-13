/**
 * Repository for the magazine importer's back-office.
 *
 * Every table this touches carries a single RLS policy — `admins only`
 * (migration 17) — so every call here already assumes the caller passed that
 * gate. It does not re-check the role: that check happens once, server-side,
 * in `magazine-vision`'s `authorize()`, and a second copy here would be a
 * second place for the two to drift apart.
 *
 * The private `imports` bucket (migration 10) is reused rather than a new one.
 * Layout, under the admin's own `{uid}/` prefix as every policy on that bucket
 * requires:
 *
 *   {uid}/magazines/{importId}/original.pdf
 *   {uid}/magazines/{importId}/cover.jpg
 *   {uid}/magazines/{importId}/pages/page-{n}.jpg
 *   {uid}/magazines/{importId}/items/{itemId}/source.jpg
 */
import type {
  MagazineImport,
  MagazineImportItem,
  MagazineImportLog,
  MagazineImportPage,
  MagazineItemStatus,
} from '@/domain/types';
import { randomId } from '@/lib/id';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import { unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import type { Json, TablesInsert, TablesUpdate } from '@/lib/supabase/database.types';
import { dataUrlToBlob } from '@/lib/pdf/text';
import type { AssembledRecipe, MagazineIdentity, MagazinePage } from '@/lib/magazine-import/types';
import { toCanonicalRecipe, type MagazineProvenance } from '@/lib/magazine-import/to-canonical';
import { saveImportedRecipe } from '@/lib/recipe-import/persist';
import type { CanonicalRecipe } from '@/lib/recipe-import/types';

const BUCKET = 'imports';

function magazineFolder(userId: string, importId: string): string {
  return `${userId}/magazines/${importId}`;
}

/* ---------------------------------------------------------------------------
 * The import row
 * ------------------------------------------------------------------------- */

/**
 * Creates the row and uploads the PDF in the same call.
 *
 * The id is generated here rather than left to the database default so the
 * storage path can be computed *before* the insert — one round trip instead of
 * "insert, then update the path the row now needs to point at".
 */
export async function uploadMagazine(
  client: AppSupabaseClient,
  userId: string,
  file: File,
): Promise<MagazineImport> {
  const id = randomId();
  const path = `${magazineFolder(userId, id)}/original.pdf`;

  const upload = await client.storage.from(BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (upload.error) throw upload.error;

  return unwrap(
    await client
      .from('magazine_imports')
      .insert({
        id,
        created_by: userId,
        file_path: path,
        file_name: file.name,
        file_size_bytes: file.size,
        status: 'uploaded',
      })
      .select('*')
      .single(),
  );
}

/** The cover render, uploaded once and pointed at from the row. */
export async function saveCoverThumbnail(
  client: AppSupabaseClient,
  userId: string,
  importId: string,
  dataUrl: string,
): Promise<string> {
  const path = `${magazineFolder(userId, importId)}/cover.jpg`;
  const upload = await client.storage
    .from(BUCKET)
    .upload(path, dataUrlToBlob(dataUrl), { contentType: 'image/jpeg', upsert: true });
  if (upload.error) throw upload.error;
  return path;
}

/** A signed URL for a private object — covers, page renders, item crops alike. */
export async function signedUrl(
  client: AppSupabaseClient,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}

export async function updateImport(
  client: AppSupabaseClient,
  importId: string,
  patch: TablesUpdate<'magazine_imports'>,
): Promise<MagazineImport> {
  return unwrap(
    await client.from('magazine_imports').update(patch).eq('id', importId).select('*').single(),
  );
}

/** Everything read off the cover, written back after the admin confirms it. */
export function identityPatch(identity: MagazineIdentity): TablesUpdate<'magazine_imports'> {
  return {
    publication: identity.publication,
    issue: identity.issue,
    publication_date: identity.publicationDate,
    language: identity.language,
    country: identity.country,
    page_count: identity.pageCount,
  };
}

export async function getImport(
  client: AppSupabaseClient,
  importId: string,
): Promise<MagazineImport | null> {
  return unwrapMaybe(
    await client.from('magazine_imports').select('*').eq('id', importId).maybeSingle(),
  );
}

/**
 * Every admin's imports, newest first — not only the caller's own.
 *
 * The RLS policy is `is_admin()`, not `created_by = auth.uid()`, on purpose
 * (§26 asks that a second admin be able to pick up someone else's review), so
 * this is deliberately unfiltered by user.
 */
export async function listImports(client: AppSupabaseClient): Promise<MagazineImport[]> {
  return unwrap(
    await client.from('magazine_imports').select('*').order('created_at', { ascending: false }),
  );
}

/**
 * §30 — two depths of delete.
 *
 * Deleting the row cascades to its pages, items and logs (all FK'd
 * `on delete cascade`), but never to `recipes`: `magazine_import_items.recipe_id`
 * points *at* a recipe with `on delete set null`, which only fires the other
 * way around. So "also delete the recipes" is an explicit step, run first, and
 * it only ever touches recipes this import produced that are **not**
 * published — a published recipe is never removed by deleting its import.
 *
 * Known gap: this does not walk the storage bucket to remove the PDF, page
 * renders and crops under this import's prefix. Reclaiming that is a batch
 * job, not a click a reviewer should wait on; documented rather than hidden.
 */
export async function deleteImport(
  client: AppSupabaseClient,
  importId: string,
  options: { alsoDeleteUnpublishedRecipes: boolean },
): Promise<void> {
  if (options.alsoDeleteUnpublishedRecipes) {
    const items = unwrap(
      await client
        .from('magazine_import_items')
        .select('recipe_id, recipes(status)')
        .eq('import_id', importId)
        .not('recipe_id', 'is', null),
    );
    const unpublished = items
      .filter((item) => item.recipes?.status !== 'published')
      .map((item) => item.recipe_id)
      .filter((id): id is string => id !== null);

    if (unpublished.length > 0) {
      unwrap(await client.from('recipes').delete().in('id', unpublished).select('id'));
    }
  }

  unwrap(await client.from('magazine_imports').delete().eq('id', importId).select('id'));
}

/* ---------------------------------------------------------------------------
 * Pages — the resume mechanism
 * ------------------------------------------------------------------------- */

export async function listPages(
  client: AppSupabaseClient,
  importId: string,
): Promise<MagazineImportPage[]> {
  return unwrap(
    await client
      .from('magazine_import_pages')
      .select('*')
      .eq('import_id', importId)
      .order('page_number', { ascending: true }),
  );
}

/** Writes one row per page, right after the PDF's text has been read once. */
export async function insertPages(
  client: AppSupabaseClient,
  importId: string,
  pages: MagazinePage[],
): Promise<void> {
  if (pages.length === 0) return;
  const rows: TablesInsert<'magazine_import_pages'>[] = pages.map((page) => ({
    import_id: importId,
    page_number: page.index,
    text_excerpt: page.text || null,
    status: 'pending',
  }));
  unwrap(await client.from('magazine_import_pages').insert(rows).select('id'));
}

export async function updatePage(
  client: AppSupabaseClient,
  pageId: string,
  patch: TablesUpdate<'magazine_import_pages'>,
): Promise<void> {
  unwrap(await client.from('magazine_import_pages').update(patch).eq('id', pageId).select('id'));
}

/* ---------------------------------------------------------------------------
 * Items — the recipes found
 * ------------------------------------------------------------------------- */

export async function listItems(
  client: AppSupabaseClient,
  importId: string,
): Promise<MagazineImportItem[]> {
  return unwrap(
    await client
      .from('magazine_import_items')
      .select('*')
      .eq('import_id', importId)
      .order('created_at', { ascending: true }),
  );
}

export async function getItem(
  client: AppSupabaseClient,
  itemId: string,
): Promise<MagazineImportItem | null> {
  return unwrapMaybe(
    await client.from('magazine_import_items').select('*').eq('id', itemId).maybeSingle(),
  );
}

/** One raw, unassembled recipe read off a single page — before continuation is resolved. */
export async function insertRawItem(
  client: AppSupabaseClient,
  importId: string,
  input: { pageIndex: number; blockIndex: number; recipe: unknown },
): Promise<void> {
  unwrap(
    await client
      .from('magazine_import_items')
      .insert({
        import_id: importId,
        source_pages: [input.pageIndex],
        block_index: input.blockIndex,
        source_data: input.recipe as Json,
        status: 'detected',
      })
      .select('id'),
  );
}

export async function listRawItems(
  client: AppSupabaseClient,
  importId: string,
): Promise<MagazineImportItem[]> {
  return unwrap(
    await client
      .from('magazine_import_items')
      .select('*')
      .eq('import_id', importId)
      .eq('status', 'detected'),
  );
}

/**
 * Replaces the raw, per-page rows with the assembled, scored, adapted ones.
 *
 * Assembly can only run once every recipe page has been extracted — it needs
 * to see a continuation's other half — so the per-page rows exist only until
 * this runs, and only ever as `status = 'detected'`. Nothing outside the
 * runner reads them in that state.
 */
export async function replaceWithAssembledItems(
  client: AppSupabaseClient,
  importId: string,
  assembled: { recipe: AssembledRecipe; transformed: CanonicalRecipe; title: string }[],
): Promise<void> {
  unwrap(
    await client
      .from('magazine_import_items')
      .delete()
      .eq('import_id', importId)
      .eq('status', 'detected')
      .select('id'),
  );
  if (assembled.length === 0) return;

  const rows: TablesInsert<'magazine_import_items'>[] = assembled.map((entry) => ({
    import_id: importId,
    title: entry.title,
    source_pages: entry.recipe.pages,
    block_index: entry.recipe.blockIndex,
    source_data: entry.recipe.recipe as unknown as Json,
    transformed_data: entry.transformed as unknown as Json,
    confidence: {
      ...entry.recipe.confidence,
      verdict: entry.recipe.verdict,
      findings: entry.recipe.findings,
      indexedTitle: entry.recipe.indexedTitle,
    },
    status: 'extracted',
    needs_review: entry.recipe.verdict !== 'ready',
    fingerprint: entry.transformed.fingerprint,
  }));
  unwrap(await client.from('magazine_import_items').insert(rows).select('id'));
}

export async function updateItem(
  client: AppSupabaseClient,
  itemId: string,
  patch: TablesUpdate<'magazine_import_items'>,
): Promise<void> {
  unwrap(await client.from('magazine_import_items').update(patch).eq('id', itemId).select('id'));
}

export type ItemFilter = 'all' | MagazineItemStatus | 'needs_review';

/**
 * §22's tabs, applied client-side.
 *
 * A dedicated query per tab would be five near-identical calls for a list that
 * is, per import, at most a couple of hundred rows — filtering the one list
 * already in memory is simpler and just as fast at this scale.
 */
export function filterItems(items: MagazineImportItem[], filter: ItemFilter): MagazineImportItem[] {
  if (filter === 'all') return items;
  if (filter === 'needs_review') return items.filter((item) => item.needs_review);
  return items.filter((item) => item.status === filter);
}

/**
 * Turns a reviewed item into a real recipe.
 *
 * Delegates to `saveImportedRecipe`, the exact function every other provider
 * already writes through — a magazine recipe becomes a `recipes` row the same
 * way a Cookomix one does, with the same draft-only, RLS-enforced insert.
 */
export async function importItem(
  client: AppSupabaseClient,
  item: MagazineImportItem,
  userId: string,
): Promise<{ id: string; slug: string }> {
  if (!item.transformed_data) {
    throw new Error('Esta receita ainda não foi adaptada — nada para importar.');
  }
  const recipe = item.transformed_data as unknown as CanonicalRecipe;
  const saved = await saveImportedRecipe(client, { recipe, userId });

  await updateItem(client, item.id, {
    status: 'imported',
    recipe_id: saved.id,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  });

  return saved;
}

export async function ignoreItem(
  client: AppSupabaseClient,
  itemId: string,
  userId: string,
): Promise<void> {
  await updateItem(client, itemId, {
    status: 'ignored',
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  });
}

export async function approveItem(
  client: AppSupabaseClient,
  itemId: string,
  userId: string,
): Promise<void> {
  await updateItem(client, itemId, {
    status: 'approved',
    needs_review: false,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  });
}

/**
 * Flips the import to `completed` once every recipe it produced has a final
 * disposition (imported or ignored) — the runner itself never sets
 * `completed`, only `review_required`, because whether a batch of recipes is
 * "done" is a human decision made one item at a time, not a pipeline outcome.
 */
export async function syncImportStatus(client: AppSupabaseClient, importId: string): Promise<void> {
  const items = await listItems(client, importId);
  if (items.length === 0) return;
  const allResolved = items.every(
    (item) => item.status === 'imported' || item.status === 'ignored',
  );
  if (!allResolved) return;

  await updateImport(client, importId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
}

/* ---------------------------------------------------------------------------
 * Provenance and transformation
 * ------------------------------------------------------------------------- */

export function toProvenance(magazineImport: MagazineImport, folios: number[]): MagazineProvenance {
  return {
    importId: magazineImport.id,
    publication: magazineImport.publication,
    issue: magazineImport.issue,
    publicationDate: magazineImport.publication_date,
    language: magazineImport.language,
    folios,
  };
}

export function buildCanonicalRecipe(
  assembled: AssembledRecipe,
  magazineImport: MagazineImport,
): CanonicalRecipe {
  return toCanonicalRecipe(assembled.recipe, toProvenance(magazineImport, assembled.pages), {
    importedAt: new Date().toISOString(),
  });
}

/* ---------------------------------------------------------------------------
 * Logs — §32
 * ------------------------------------------------------------------------- */

export async function appendLog(
  client: AppSupabaseClient,
  importId: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  // Best-effort: a run that cannot write its own diary should not abort over
  // it. `void` rather than `await` at the call sites is the other half of this.
  const { error } = await client
    .from('magazine_import_logs')
    .insert({ import_id: importId, level, message, context: context as Json });
  if (error) console.error('magazine import log write failed', error);
}

export async function listLogs(
  client: AppSupabaseClient,
  importId: string,
): Promise<MagazineImportLog[]> {
  return unwrap(
    await client
      .from('magazine_import_logs')
      .select('*')
      .eq('import_id', importId)
      .order('created_at', { ascending: true }),
  );
}

/* ---------------------------------------------------------------------------
 * AI cost — §33
 * ------------------------------------------------------------------------- */

export async function recordAiUsage(
  client: AppSupabaseClient,
  userId: string,
  importId: string | null,
  usage: {
    provider: string;
    model: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  },
): Promise<void> {
  const { error } = await client.from('ai_usage_events').insert({
    created_by: userId,
    magazine_import_id: importId,
    provider: usage.provider,
    model: usage.model,
    operation: usage.operation,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    estimated_cost_usd: usage.estimatedCostUsd,
  });
  if (error) console.error('AI usage event write failed', error);
}

export async function totalCost(client: AppSupabaseClient, importId: string): Promise<number> {
  const rows = unwrap(
    await client
      .from('ai_usage_events')
      .select('estimated_cost_usd')
      .eq('magazine_import_id', importId),
  );
  return rows.reduce((sum, row) => sum + row.estimated_cost_usd, 0);
}
