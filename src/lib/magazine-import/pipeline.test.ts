import { describe, expect, it } from 'vitest';

import { planClassification } from './pipeline';
import type { MagazinePage, RecipeIndexEntry } from './types';

const RECIPE_TEXT = `
GASPACHO DE TOMATE
Pour 4 personnes
Préparation : 20 min · Repos : 2 h

Ingrédients
1 kg de tomates bien mûres
1 concombre
2 gousses d'ail
5 cl d'huile d'olive
sel, poivre
`;

const page = (index: number, text = ''): MagazinePage => ({
  index,
  folio: null,
  text,
  hasLargeImage: false,
});

/**
 * A realistic full-file page range, all filler except where a test overrides
 * one entry. `pageCount` (`pages.length`) has to be the whole magazine — the
 * folio → file-position math clamps against it — so no test here trims the
 * range down to just the pages it cares about.
 */
function fillerPages(total: number, overrides: Record<number, string> = {}): MagazinePage[] {
  return Array.from({ length: total }, (_, i) => {
    const index = i + 1;
    return page(index, overrides[index] ?? 'ambiguous filler text here');
  });
}

describe('planClassification', () => {
  it('settles a clearly-recipe page from text alone, at no cost', () => {
    // Index 5, not 1: `classifyByText` treats the file's first page as the
    // cover unconditionally, which would settle this for the wrong reason.
    const plan = planClassification([page(5, RECIPE_TEXT)], [], null);
    expect(plan.decided.get(5)?.kind).toBe('recipe');
    expect(plan.visionCandidates).toEqual([]);
  });

  it('sends an ambiguous page to vision when it sits where the index says a recipe is', () => {
    const pages = fillerPages(12);
    const index: RecipeIndexEntry[] = [
      { title: 'Gaspacho', folio: 2 },
      { title: 'Tarte', folio: 5 },
      { title: 'Risotto', folio: 8 },
      { title: 'Tartare', folio: 11 },
    ];
    // No offset measured: folio is read as the file position directly.
    const plan = planClassification(pages, index, null);

    expect(plan.visionCandidates).toContain(2);
  });

  it('skips an ambiguous page nowhere near a trusted index, rather than guessing', () => {
    const pages = fillerPages(60);
    const index: RecipeIndexEntry[] = [
      { title: 'Gaspacho', folio: 2 },
      { title: 'Tarte', folio: 5 },
      { title: 'Risotto', folio: 8 },
      { title: 'Tartare', folio: 11 },
    ];
    const plan = planClassification(pages, index, null);

    // Page 50 is nowhere near any of the four indexed pages, and the index
    // clears the trust bar — so it is skipped, not sent to the model.
    expect(plan.skipped).toContain(50);
    expect(plan.visionCandidates).not.toContain(50);
  });

  it('never skips when the index is too thin to trust', () => {
    const pages = fillerPages(60);
    const index: RecipeIndexEntry[] = [{ title: 'Gaspacho', folio: 2 }];

    const plan = planClassification(pages, index, null);

    // One entry is not a table of contents. Every ambiguous page is still
    // worth a model call rather than being silently dropped.
    expect(plan.skipped).toEqual([]);
    expect(plan.visionCandidates).toContain(50);
  });

  it('honours a measured folio offset when matching the index to file pages', () => {
    // A 60-page file where the printed numbering runs 4 pages ahead of the
    // file position (unnumbered cover and front matter) — `pageCount` must be
    // the whole file, exactly as `readAllPages` would hand it over, or the
    // folio → file-position math has nothing real to clamp against.
    const pages = Array.from({ length: 60 }, (_, i) => page(i + 1, 'ambiguous filler text here'));
    // The index says "page 53"; file position 57 is where that page actually is.
    const index: RecipeIndexEntry[] = [
      { title: 'A', folio: 53 },
      { title: 'B', folio: 60 },
      { title: 'C', folio: 65 },
      { title: 'D', folio: 70 },
    ];

    const plan = planClassification(pages, index, -4);

    expect(plan.visionCandidates).toContain(57);
  });
});
