/**
 * The one genuinely stateful decision in the pipeline: which pages are worth a
 * model call, and which are not.
 *
 * Kept apart from the runner that executes it because this part — unlike
 * uploading a file or rendering a canvas — is plain data in, plain data out,
 * and deserves to be tested as such. §8 of the brief is explicit about why it
 * exists at all: reading the recipe index first and using it to bound what
 * gets classified in depth is what keeps a hundred-page issue from costing a
 * hundred vision calls.
 */
import { folioToIndex } from './folio.ts';
import { classifyByText, TEXT_TRUST_THRESHOLD } from './page-classifier.ts';
import { MIN_USEFUL_ENTRIES } from './index-reader.ts';
import type { MagazinePage, PageVerdict, RecipeIndexEntry } from './types.ts';

export interface ClassificationPlan {
  /** Settled for free, from the page's own text. Nothing left to do. */
  decided: Map<number, PageVerdict>;
  /** Ambiguous from text, and worth a vision call — near a known recipe. */
  visionCandidates: number[];
  /**
   * Ambiguous from text, and *not* spent on a vision call — because the
   * magazine's own index is trusted and this page is nowhere near an entry.
   * Never silent: the runner logs the count, and the page stays reachable
   * (`status = 'skipped'`, not deleted) for a human to override.
   */
  skipped: number[];
}

/**
 * Builds the plan. Never calls a model — `pages[].text` already has whatever
 * the PDF's own text layer gave up; deciding what to *do* with that is all
 * that happens here.
 */
export function planClassification(
  pages: MagazinePage[],
  indexEntries: RecipeIndexEntry[],
  folioOffset: number | null,
): ClassificationPlan {
  const pageCount = pages.length;
  const indexCandidateIndices = new Set(
    indexEntries.map((entry) => folioToIndex(entry.folio, folioOffset, pageCount)),
  );
  // Trusted only once it clears the same bar `readIndexFromText` itself uses —
  // three or four stray entries are not a table of contents worth betting the
  // whole magazine's coverage on.
  const hasTrustedIndex = indexEntries.length >= MIN_USEFUL_ENTRIES;

  const decided = new Map<number, PageVerdict>();
  const visionCandidates: number[] = [];
  const skipped: number[] = [];

  for (const page of pages) {
    const verdict = classifyByText(page, { pageCount });
    if (verdict && verdict.confidence >= TEXT_TRUST_THRESHOLD) {
      decided.set(page.index, verdict);
      continue;
    }

    if (indexCandidateIndices.has(page.index)) {
      visionCandidates.push(page.index);
    } else if (hasTrustedIndex) {
      skipped.push(page.index);
    } else {
      // No index to lean on: spending a token beats missing a recipe.
      visionCandidates.push(page.index);
    }
  }

  return { decided, visionCandidates, skipped };
}
