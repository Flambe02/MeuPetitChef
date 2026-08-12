/**
 * Deciding what a page is, for free.
 *
 * This file exists to keep the model out of the loop. A hundred-page issue sent
 * page by page to a vision model is a hundred calls, most of them spent
 * confirming that an advert for olive oil is an advert for olive oil. Almost
 * every recipe page in a modern magazine carries a text layer, and a recipe has
 * a shape no other page has: a column of "250 g de farine" lines, a serving
 * count, and a couple of timings.
 *
 * So: read the text first, and only pay for the pages the text cannot settle.
 * A verdict is returned **only** when the evidence is strong; anything else
 * returns null, which the pipeline reads as "ask the model". Being unsure is
 * cheap — being confidently wrong about page 61 costs a recipe.
 *
 * The patterns cover French, Portuguese, Spanish, Italian, English and German,
 * because that is what the named magazines publish in.
 */
import { fold, squish } from '@/lib/recipe-import/text';

import type { MagazinePage, PageVerdict } from './types.ts';

/** Below this, a text verdict is not worth trusting and the model is called. */
export const TEXT_TRUST_THRESHOLD = 0.75;

/** Under this many characters a page has no usable text layer at all. */
const NO_TEXT_LAYER = 120;

/* ── Signals ──────────────────────────────────────────────────────────────
 * Matched against `fold()`ed text: lowercase, accents stripped. "SOMMAIRE",
 * "Sommaire" and "sommaíre" are the same signal.
 * ---------------------------------------------------------------------- */

/** A table of contents that specifically lists recipes. */
const RECIPE_INDEX_HEADING =
  /\b(index des recettes|sommaire des recettes|toutes les recettes|nos recettes|indice das receitas|sumario das receitas|indice de las recetas|recipe index|index of recipes|le ricette)\b/;

/** A generic table of contents. Still worth reading — it lists pages. */
const INDEX_HEADING = /\b(sommaire|sumario|indice|contents|inhalt|indice generale)\b/;

const SERVINGS =
  /\b(pour\s+\d+\s+personnes?|para\s+\d+\s+pessoas?|para\s+\d+\s+personas?|per\s+\d+\s+persone|fur\s+\d+\s+personen|serves\s+\d+|rende\s+\d+|rendimento|\d+\s+porcoes|\d+\s+porcao|\d+\s+portions?|\d+\s+parts)\b/;

/** "Préparation : 20 min", "Preparo: 15 min", "Cook time 25 min". */
const TIMING =
  /\b(preparation|preparo|preparacion|preparazione|cuisson|cozimento|coccion|forno|repos|descanso|riposo|marinade|refrigeracao|prep\s*time|cook\s*time|zubereitung|backzeit)\b\D{0,12}\d/;

/** Words that only appear where a recipe is being written out. */
const RECIPE_SECTION =
  /\b(ingredients|ingredientes|ingredienti|zutaten|modo de preparo|preparation|preparo|realisation|etapes|passo a passo|instructions|zubereitung)\b/;

const UNIT_WORD =
  /\b(g|kg|mg|ml|cl|dl|l|c\.?\s?a\.?\s?[sc]\.?|cuilleres?|cuillere|colheres?|colher|xicaras?|xicara|copos?|copo|pitadas?|pitada|pincees?|pincee|gousses?|gousse|dentes?|dente|un|unidades?|unidade|fatias?|tranches?|sachets?|saches?|boites?|latas?|folhas?|ramos?|brins?|tbsp|tsp|cups?|oz|lb)\b/;

/** "3. Mélangez le tout." — a numbered step, not a quantity. */
const STEP_NUMBERING = /^\d{1,2}\s*[.)]\s+\p{Lu}/u;

/** Leading quantity: a digit, a vulgar fraction, or "1/2". */
const LEADING_QUANTITY = /^[•\-–—*·\s]*(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])/;

/** "Gaspacho .................. 53" — an index line, with or without leaders. */
const INDEX_ENTRY = /\p{L}[^\n]{2,}?(?:[.…\s]{3,}|\s{2,})(\d{1,3})\s*$/u;

/* ── Line-level tests ─────────────────────────────────────────────────── */

/**
 * Does this line look like an ingredient?
 *
 * Deliberately conservative. The costly mistake is not missing a line — the
 * threshold is a count, and recipes have many — but counting a numbered step as
 * one, which would turn every how-to article into a "recipe".
 */
export function looksLikeIngredientLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 70) return false;
  if (STEP_NUMBERING.test(trimmed)) return false;
  if (!LEADING_QUANTITY.test(trimmed)) return false;

  const folded = fold(trimmed);
  if (UNIT_WORD.test(folded)) return true;
  // "2 oeufs", "1 oignon" carry no unit. Short and quantity-led is enough; a
  // sentence that happens to start with a number is not short.
  return trimmed.split(/\s+/).length <= 5;
}

function looksLikeIndexEntry(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 6 && trimmed.length <= 90 && INDEX_ENTRY.test(trimmed);
}

/* ── The verdict ──────────────────────────────────────────────────────── */

export interface ClassifyContext {
  pageCount: number;
}

/**
 * A page's kind from its text alone, or null when the text cannot settle it.
 *
 * Null is the honest answer for three quite different pages — a full-bleed
 * photograph, a scanned issue with no text layer, and an ambiguous half-recipe
 * half-feature spread — and all three want the same thing next: the model.
 */
export function classifyByText(page: MagazinePage, context: ClassifyContext): PageVerdict | null {
  const text = page.text;
  const folded = fold(text);
  const lines = text.split('\n');
  const reasons: string[] = [];

  // The first page of a file is its cover. This is not an inference worth
  // paying a model for, and it is right essentially always.
  if (page.index === 1) {
    return verdict('cover', 0.95, 'text', ['Primeira página do arquivo.']);
  }

  const indexEntries = lines.filter(looksLikeIndexEntry).length;
  const ingredientLines = lines.filter(looksLikeIngredientLine).length;
  const hasServings = SERVINGS.test(folded);
  const hasTiming = TIMING.test(folded);
  const hasSection = RECIPE_SECTION.test(folded);

  /* ── An index is worth more than any single page ────────────────────── */
  if (RECIPE_INDEX_HEADING.test(folded) && indexEntries >= 4) {
    return verdict('recipe_index', 0.92, 'text', [
      `Título de índice de receitas e ${indexEntries} entradas com página.`,
    ]);
  }
  if (INDEX_HEADING.test(folded) && indexEntries >= 6) {
    return verdict('index', 0.82, 'text', [
      `Sumário com ${indexEntries} entradas — pode listar receitas.`,
    ]);
  }

  /* ── A recipe has a shape ───────────────────────────────────────────── */
  if (ingredientLines >= 4 && (hasServings || hasTiming)) {
    reasons.push(`${ingredientLines} linhas de ingrediente`);
    if (hasServings) reasons.push('número de porções impresso');
    if (hasTiming) reasons.push('tempos impressos');
    return verdict('recipe', 0.94, 'text', reasons);
  }
  if (ingredientLines >= 6) {
    return verdict('recipe', 0.86, 'text', [
      `${ingredientLines} linhas de ingrediente, sem porções declaradas.`,
    ]);
  }
  if (hasSection && hasServings && hasTiming) {
    return verdict('recipe', 0.8, 'text', [
      'Traz “ingredientes”, porções e tempos — formato de receita.',
    ]);
  }

  /* ── Not enough to say ──────────────────────────────────────────────── */
  if (squish(text).length < NO_TEXT_LAYER) {
    // A page with no text is not an advert. It is a page we cannot read: a
    // full-page photograph, a scan, an all-vector layout. The model decides.
    return null;
  }

  /* ── A lot of prose and none of the recipe furniture ────────────────── */
  if (ingredientLines === 0 && !hasServings && !hasSection && squish(text).length > 700) {
    return verdict('article', 0.78, 'text', [
      'Texto corrido, sem lista de ingredientes nem porções.',
    ]);
  }

  // The last page of a magazine is very often the index — but "very often" is
  // not a classification, so it only nudges the model's way, never decides.
  if (page.index === context.pageCount && indexEntries >= 3) {
    return verdict('index', 0.76, 'text', ['Última página com entradas numeradas.']);
  }

  return null;
}

function verdict(
  kind: PageVerdict['kind'],
  confidence: number,
  by: PageVerdict['by'],
  reasons: string[],
): PageVerdict {
  return { kind, confidence, by, reasons, recipeTitles: [] };
}

/** Pages whose contents are worth reading in full. */
export function isWorthExtracting(kind: PageVerdict['kind']): boolean {
  return kind === 'recipe' || kind === 'unknown';
}

/** Pages that list recipes and their page numbers. */
export function isIndexPage(kind: PageVerdict['kind']): boolean {
  return kind === 'index' || kind === 'recipe_index';
}
