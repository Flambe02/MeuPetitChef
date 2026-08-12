/**
 * The pipeline itself: PDF → pages → index → classify → extract → assemble.
 *
 * Every step writes its result to the database before moving to the next one,
 * which is what §31 asks for — "si l'analyse s'interrompt page 64, ne pas
 * recommencer pages 1 à 63" — and what makes it true: `runMagazineImport` can
 * be called again on the same `importId` at any point and it picks up exactly
 * where the rows say it left off. Nothing here holds pipeline state in memory
 * across calls; the database is the state.
 *
 * This file is orchestration, not logic. The actual decisions —
 * `planClassification`, `assembleRecipes`, `scoreRecipe`, `toCanonicalRecipe`
 * — live in `@/lib/magazine-import` and are unit-tested there. What is left
 * here is "call the database, call the model, write the result", which is
 * exercised by hand against a real PDF rather than by `npm test` — the same
 * boundary `fetch-source.ts` draws around the network calls it makes.
 */
import { getPageCount, readAllPages, renderPageToDataUrl } from '@/lib/pdf/document';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { readFolio, detectFolioOffset } from '@/lib/magazine-import/folio';
import { classifyByText } from '@/lib/magazine-import/page-classifier';
import { readIndexFromText, mergeIndexes } from '@/lib/magazine-import/index-reader';
import { planClassification } from '@/lib/magazine-import/pipeline';
import { assembleRecipes, type PageExtraction } from '@/lib/magazine-import/assemble';
import type {
  MagazinePage,
  MagazineRecipe,
  MagazineVisionProvider,
  RecipeIndexEntry,
  VisionPage,
} from '@/lib/magazine-import/types';

import type { AppSupabaseClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';
import type { MagazineImport, MagazineImportPage } from '@/domain/types';

import {
  appendLog,
  buildCanonicalRecipe,
  getImport,
  insertPages,
  insertRawItem,
  listItems,
  listPages,
  listRawItems,
  recordAiUsage,
  replaceWithAssembledItems,
  updateImport,
  updatePage,
} from './api';

export class RunAborted extends Error {
  constructor() {
    super('Importação interrompida pelo usuário.');
    this.name = 'RunAborted';
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function now(): string {
  return new Date().toISOString();
}

function rowToMagazinePage(row: MagazineImportPage): MagazinePage {
  const text = row.text_excerpt ?? '';
  return { index: row.page_number, folio: readFolio(text), text, hasLargeImage: false };
}

async function toVisionPage(doc: PDFDocumentProxy, page: MagazinePage): Promise<VisionPage> {
  const imageDataUrl = await renderPageToDataUrl(doc, page.index);
  return { index: page.index, folio: page.folio, imageDataUrl, text: page.text };
}

/* ---------------------------------------------------------------------------
 * Metadata as the index's resting place
 *
 * `magazine_imports.metadata` is documented as shapeless and unqueried — this
 * is the one place that gives it a shape, and only for this one purpose.
 * `indexReady` guards against re-spending a vision call on every resume once
 * the index has already been settled, thin or not.
 * ------------------------------------------------------------------------- */

interface StoredIndex {
  entries: RecipeIndexEntry[];
  ready: boolean;
}

function readStoredIndex(metadata: Json): StoredIndex {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { entries: [], ready: false };
  }
  const record = metadata as Record<string, unknown>;
  const raw = record['index'];
  const entries = Array.isArray(raw)
    ? raw.filter(
        (entry): entry is RecipeIndexEntry =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as Record<string, unknown>)['title'] === 'string' &&
          typeof (entry as Record<string, unknown>)['folio'] === 'number',
      )
    : [];
  return { entries, ready: record['indexReady'] === true };
}

function withStoredIndex(metadata: Json, index: StoredIndex): Json {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  return { ...base, index: index.entries as unknown as Json, indexReady: index.ready };
}

/* ---------------------------------------------------------------------------
 * Step 1 — pages
 * ------------------------------------------------------------------------- */

async function ensurePagesRead(
  client: AppSupabaseClient,
  doc: PDFDocumentProxy,
  importId: string,
): Promise<MagazineImportPage[]> {
  const existing = await listPages(client, importId);
  if (existing.length > 0) return existing;

  await updateImport(client, importId, {
    status: 'processing',
    stage: 'reading_pages',
    started_at: now(),
  });
  await appendLog(client, importId, 'info', 'Lendo o texto de cada página do PDF.');

  const total = getPageCount(doc);
  const pages = await readAllPages(doc);
  await insertPages(client, importId, pages);
  await updateImport(client, importId, { page_count: total });
  await appendLog(client, importId, 'info', `PDF analisado. ${String(total)} páginas.`);

  return listPages(client, importId);
}

/* ---------------------------------------------------------------------------
 * Step 2 — the recipe index (§8)
 * ------------------------------------------------------------------------- */

/** Pages a sommaire is likely to sit on, when text classification found none. */
function likelyIndexPages(pages: MagazinePage[]): MagazinePage[] {
  return pages.filter((page) => page.index >= 2 && page.index <= 6).slice(0, 3);
}

async function ensureIndexRead(
  client: AppSupabaseClient,
  doc: PDFDocumentProxy,
  provider: MagazineVisionProvider,
  magazineImport: MagazineImport,
  userId: string,
  pages: MagazinePage[],
): Promise<RecipeIndexEntry[]> {
  const stored = readStoredIndex(magazineImport.metadata);
  if (stored.ready) return stored.entries;

  const fromText = mergeIndexes(
    pages.flatMap((page) => readIndexFromText(page.text)),
    [],
  );

  let finalEntries = fromText;
  if (fromText.length < 4) {
    const candidates = pages.filter((page) => {
      const verdict = classifyByText(page, { pageCount: pages.length });
      return verdict?.kind === 'index' || verdict?.kind === 'recipe_index';
    });
    const targets = candidates.length > 0 ? candidates.slice(0, 3) : likelyIndexPages(pages);

    if (targets.length > 0) {
      try {
        const visionPages = await Promise.all(targets.map((page) => toVisionPage(doc, page)));
        const result = await provider.readIndex(visionPages);
        await recordAiUsage(client, userId, magazineImport.id, result.usage);
        finalEntries = mergeIndexes(fromText, result.data);
      } catch (error) {
        await appendLog(
          client,
          magazineImport.id,
          'warn',
          `Não foi possível ler o índice de receitas por IA: ${message(error)}.`,
        );
      }
    }
  }

  await updateImport(client, magazineImport.id, {
    metadata: withStoredIndex(magazineImport.metadata, { entries: finalEntries, ready: true }),
  });
  await appendLog(
    client,
    magazineImport.id,
    'info',
    finalEntries.length > 0
      ? `Índice de receitas: ${String(finalEntries.length)} entrada(s) encontrada(s).`
      : 'Nenhum índice de receitas identificado — todas as páginas ambíguas serão analisadas.',
  );
  return finalEntries;
}

/* ---------------------------------------------------------------------------
 * Step 3 — classification
 * ------------------------------------------------------------------------- */

async function classifyPages(
  client: AppSupabaseClient,
  doc: PDFDocumentProxy,
  provider: MagazineVisionProvider,
  importId: string,
  userId: string,
  pageRows: MagazineImportPage[],
  index: RecipeIndexEntry[],
  checkAbort: () => void,
): Promise<void> {
  const pending = pageRows.filter((row) => row.status === 'pending' || row.status === 'failed');
  if (pending.length === 0) return;

  await updateImport(client, importId, { status: 'processing', stage: 'classifying' });

  const folioOffset = detectFolioOffset(pageRows.map(rowToMagazinePage));
  const plan = planClassification(pending.map(rowToMagazinePage), index, folioOffset);
  const byIndex = new Map(pending.map((row) => [row.page_number, row]));

  for (const [pageIndex, verdict] of plan.decided) {
    const row = byIndex.get(pageIndex);
    if (!row) continue;
    await updatePage(client, row.id, {
      kind: verdict.kind,
      confidence: verdict.confidence,
      classified_by: 'text',
      status: 'classified',
      analyzed_at: now(),
    });
  }

  if (plan.skipped.length > 0) {
    for (const pageIndex of plan.skipped) {
      const row = byIndex.get(pageIndex);
      if (!row) continue;
      await updatePage(client, row.id, { status: 'skipped', analyzed_at: now() });
    }
    await appendLog(
      client,
      importId,
      'info',
      `${String(plan.skipped.length)} página(s) fora do índice de receitas — não analisadas em detalhe.`,
    );
  }

  for (const pageIndex of plan.visionCandidates) {
    checkAbort();
    const row = byIndex.get(pageIndex);
    if (!row) continue;
    try {
      const visionPage = await toVisionPage(doc, rowToMagazinePage(row));
      const result = await provider.analyzePage(visionPage);
      await recordAiUsage(client, userId, importId, result.usage);
      await updatePage(client, row.id, {
        kind: result.data.kind,
        confidence: result.data.confidence,
        classified_by: 'vision',
        status: 'classified',
        analyzed_at: now(),
      });
    } catch (error) {
      await updatePage(client, row.id, {
        status: 'failed',
        error_message: message(error),
        attempts: row.attempts + 1,
      });
      await appendLog(
        client,
        importId,
        'warn',
        `Falha ao classificar a página ${String(pageIndex)}: ${message(error)}`,
      );
    }
  }
}

/* ---------------------------------------------------------------------------
 * Step 4 — extraction, one recipe page at a time
 *
 * Deliberately not batched across pages here, even for a recipe that clearly
 * spans two: which pages belong together is exactly what `continuationBefore`
 * / `continuationAfter` in the *result* tells us, so it cannot be decided
 * beforehand. Each page is read on its own, written as a raw, unassembled
 * item, and `assembleRecipes` stitches the pieces together once every
 * candidate page has been read.
 * ------------------------------------------------------------------------- */

async function extractRecipePages(
  client: AppSupabaseClient,
  doc: PDFDocumentProxy,
  provider: MagazineVisionProvider,
  importId: string,
  userId: string,
  pageRows: MagazineImportPage[],
  checkAbort: () => void,
): Promise<void> {
  const toExtract = pageRows.filter((row) => row.kind === 'recipe' && row.status === 'classified');
  if (toExtract.length === 0) return;

  await updateImport(client, importId, { status: 'extracting', stage: 'extracting' });

  for (const row of toExtract) {
    checkAbort();
    try {
      const visionPage = await toVisionPage(doc, rowToMagazinePage(row));
      const result = await provider.extractRecipes([visionPage]);
      await recordAiUsage(client, userId, importId, result.usage);

      let blockIndex = 0;
      for (const recipe of result.data) {
        await insertRawItem(client, importId, { pageIndex: row.page_number, blockIndex, recipe });
        blockIndex += 1;
      }
      await updatePage(client, row.id, { status: 'extracted', analyzed_at: now() });
    } catch (error) {
      await updatePage(client, row.id, {
        status: 'failed',
        error_message: message(error),
        attempts: row.attempts + 1,
      });
      await appendLog(
        client,
        importId,
        'warn',
        `Falha ao extrair a receita da página ${String(row.page_number)}: ${message(error)}`,
      );
    }
  }
}

/* ---------------------------------------------------------------------------
 * Step 5 — assembly, once every recipe page has been read
 * ------------------------------------------------------------------------- */

async function assembleIfReady(
  client: AppSupabaseClient,
  importId: string,
  magazineImport: MagazineImport,
  index: RecipeIndexEntry[],
  pageRows: MagazineImportPage[],
): Promise<void> {
  const stillOpen = pageRows.some(
    (row) => row.kind === 'recipe' && (row.status === 'pending' || row.status === 'classified'),
  );
  if (stillOpen) return;

  const raw = await listRawItems(client, importId);
  if (raw.length > 0) {
    const byPage = new Map<number, { blockIndex: number; recipe: MagazineRecipe }[]>();
    for (const item of raw) {
      const pageIndex = item.source_pages[0];
      if (pageIndex === undefined || !item.source_data) continue;
      const entries = byPage.get(pageIndex) ?? [];
      entries.push({
        blockIndex: item.block_index,
        recipe: item.source_data as unknown as MagazineRecipe,
      });
      byPage.set(pageIndex, entries);
    }

    const extractions: PageExtraction[] = [...byPage.entries()].map(([pageIndex, entries]) => ({
      pageIndex,
      recipes: entries.sort((a, b) => a.blockIndex - b.blockIndex).map((entry) => entry.recipe),
    }));

    const assembled = assembleRecipes(extractions, { index });
    const withTransform = assembled.map((entry) => ({
      recipe: entry,
      transformed: buildCanonicalRecipe(entry, magazineImport),
      title: entry.recipe.title,
    }));
    await replaceWithAssembledItems(client, importId, withTransform);
    await appendLog(
      client,
      importId,
      'info',
      `${String(assembled.length)} receita(s) reunida(s) e adaptada(s) para o Cookimix.`,
    );
  }

  const items = await listItems(client, importId);
  const analyzed = pageRows.filter((row) => row.status !== 'pending').length;

  await updateImport(client, importId, {
    status: items.length > 0 ? 'review_required' : 'completed',
    stage: null,
    pages_analyzed: analyzed,
    recipe_count: items.length,
    completed_at: items.length === 0 ? now() : null,
  });
  await appendLog(
    client,
    importId,
    'info',
    `Importação processada: ${String(items.length)} receita(s) para revisar.`,
  );
}

/* ---------------------------------------------------------------------------
 * The entry point
 * ------------------------------------------------------------------------- */

export interface RunnerHooks {
  /** Called after every unit of DB-visible progress — a page, an index read. */
  onProgress?: () => void;
  signal?: AbortSignal;
}

export async function runMagazineImport(
  client: AppSupabaseClient,
  doc: PDFDocumentProxy,
  provider: MagazineVisionProvider,
  importId: string,
  userId: string,
  hooks: RunnerHooks = {},
): Promise<void> {
  const checkAbort = () => {
    if (hooks.signal?.aborted) throw new RunAborted();
  };

  const magazineImport = await getImport(client, importId);
  if (!magazineImport) throw new Error('Import não encontrado.');

  try {
    checkAbort();
    const pageRows = await ensurePagesRead(client, doc, importId);
    hooks.onProgress?.();
    checkAbort();

    const magazinePages = pageRows.map(rowToMagazinePage);
    const index = await ensureIndexRead(
      client,
      doc,
      provider,
      magazineImport,
      userId,
      magazinePages,
    );
    hooks.onProgress?.();
    checkAbort();

    await classifyPages(client, doc, provider, importId, userId, pageRows, index, checkAbort);
    hooks.onProgress?.();

    const afterClassify = await listPages(client, importId);
    checkAbort();

    await extractRecipePages(client, doc, provider, importId, userId, afterClassify, checkAbort);
    hooks.onProgress?.();

    const afterExtract = await listPages(client, importId);
    const latestImport = (await getImport(client, importId)) ?? magazineImport;
    await assembleIfReady(client, importId, latestImport, index, afterExtract);
    hooks.onProgress?.();
  } catch (error) {
    if (error instanceof RunAborted) {
      await appendLog(client, importId, 'info', 'Importação pausada — pode ser retomada depois.');
      return;
    }
    await updateImport(client, importId, { status: 'failed', error_message: message(error) });
    await appendLog(client, importId, 'error', `Falha na importação: ${message(error)}`);
    throw error;
  }
}
