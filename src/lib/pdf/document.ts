/**
 * Reading a PDF in the browser: page count, page text, and page renders.
 *
 * This is the one file in the magazine pipeline allowed to touch pdf.js and a
 * DOM canvas. Everything above it — `page-classifier`, `folio`, `index-reader`,
 * `assemble`, `to-canonical` — works on plain data and is unit-tested without a
 * browser. This file cannot be: importing `pdfjs-dist` at all throws in Vitest's
 * jsdom (it reaches for `DOMMatrix`, which jsdom does not provide), so it is
 * exercised by hand against a real PDF rather than by `npm test`. `./text.ts`
 * holds the two helpers plain enough to test, precisely so they do not have to
 * live in a file that cannot be imported under test.
 *
 * Loaded lazily, always. pdf.js is close to a megabyte, and none of the
 * eighteen screens a non-admin ever opens should pay for it — see the
 * dynamic `import()` in `features/magazine-import`.
 */
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
// `?url` hands back the built asset's URL rather than its contents — the
// bundler-recommended way to point pdf.js at its own worker without pulling
// the worker's ~1 MB into whichever chunk imports this file.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { readFolio } from '@/lib/magazine-import/folio';
import type { MagazinePage } from '@/lib/magazine-import/types';

import { joinTextItems } from './text';

export { dataUrlToBlob } from './text';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Below this many characters, a page is presumed to be mostly a picture. */
const SPARSE_TEXT_THRESHOLD = 200;

export async function loadPdfDocument(source: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  const task = pdfjsLib.getDocument({ data: source });
  return task.promise;
}

/**
 * Releases the document's worker and cached pages. Call when a run ends.
 *
 * `PDFDocumentProxy` itself has no `destroy()` — only the loading task that
 * produced it does, and it stays reachable from `doc.loadingTask` for exactly
 * this reason.
 */
export async function unloadPdfDocument(doc: PDFDocumentProxy): Promise<void> {
  await doc.loadingTask.destroy();
}

export function getPageCount(doc: PDFDocumentProxy): number {
  return doc.numPages;
}

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
}

/**
 * A photograph, however it made it into the PDF: a plain `Image` XObject
 * (the common case, including embedded JPEGs — pdf.js does not give JPEGs a
 * distinct operator) or an inline one for small images some producers embed
 * directly in the content stream.
 */
function countImageOps(fnArray: number[]): number {
  const { OPS } = pdfjsLib;
  let count = 0;
  for (const fn of fnArray) {
    if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintImageXObjectRepeat ||
      fn === OPS.paintInlineImageXObject
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * One page's text, and a cheap "is this mostly a picture" signal.
 *
 * `hasLargeImage` is a lead, not a verdict — it does not attempt to measure the
 * image against the page (that needs the graphics-state transform stack pdf.js
 * does not expose cheaply) and is left for the classifier to weigh alongside
 * everything else it knows, exactly as `MagazinePage.hasLargeImage` documents.
 */
export async function readPageText(
  doc: PDFDocumentProxy,
  index: number,
): Promise<{ text: string; hasLargeImage: boolean }> {
  const page = await doc.getPage(index);
  try {
    const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const text = joinTextItems(content.items as TextItemLike[]);
    const hasLargeImage =
      countImageOps(operators.fnArray) > 0 && text.trim().length < SPARSE_TEXT_THRESHOLD;
    return { text, hasLargeImage };
  } finally {
    page.cleanup();
  }
}

/**
 * Every page's text, in file order.
 *
 * The one unavoidably expensive step — run once per import, right after
 * upload, and its result is what gets written to `magazine_import_pages` so it
 * never has to run again for this file.
 */
export async function readAllPages(
  doc: PDFDocumentProxy,
  onProgress?: (readCount: number, total: number) => void,
): Promise<MagazinePage[]> {
  const pages: MagazinePage[] = [];
  const total = getPageCount(doc);
  for (let index = 1; index <= total; index += 1) {
    const { text, hasLargeImage } = await readPageText(doc, index);
    pages.push({ index, folio: readFolio(text), text, hasLargeImage });
    onProgress?.(index, total);
  }
  return pages;
}

export interface RenderOptions {
  /** Target for the longest edge, in CSS pixels. */
  maxDimension?: number;
  quality?: number;
}

/**
 * Legible for a vision model, not print-quality. A magazine page at pdf.js's
 * base scale (72 dpi) is often under 700 px on its long edge — too soft to
 * read an ingredient list — so this upscales small pages as readily as it
 * downscales large ones.
 */
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.82;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function renderToDataUrl(page: PDFPageProxy, options: RenderOptions): Promise<string> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;

  const base = page.getViewport({ scale: 1 });
  const scale = clamp(maxDimension / Math.max(base.width, base.height), MIN_SCALE, MAX_SCALE);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D não disponível neste navegador.');

  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', quality);
}

/** Renders one page to a JPEG data URL — the shape `VisionPage.imageDataUrl` expects. */
export async function renderPageToDataUrl(
  doc: PDFDocumentProxy,
  index: number,
  options: RenderOptions = {},
): Promise<string> {
  const page = await doc.getPage(index);
  try {
    return await renderToDataUrl(page, options);
  } finally {
    page.cleanup();
  }
}

/** A small cover render for the upload preview and `magazine_imports.cover_image_path`. */
export async function renderCoverThumbnail(doc: PDFDocumentProxy): Promise<string> {
  return renderPageToDataUrl(doc, 1, { maxDimension: 480, quality: 0.78 });
}
