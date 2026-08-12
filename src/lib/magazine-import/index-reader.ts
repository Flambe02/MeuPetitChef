/**
 * Reading the magazine's own table of contents.
 *
 * This is the single highest-value optimisation in the pipeline, and §8 of the
 * brief is right about why: the magazine has already done the work. An index
 * that says "Gambas panées ... 61" turns "classify a hundred pages, then guess"
 * into "open thirty pages that are known to hold a recipe". Fewer model calls,
 * less money, faster, and — the part that matters most — far fewer false
 * positives, because a page nobody listed is a page nobody claimed was a recipe.
 *
 * The index is read from the text layer when there is one, which costs nothing.
 * The model is only asked when the parse comes back thin.
 */
import { fold, squish } from '@/lib/recipe-import/text';

import type { RecipeIndexEntry } from './types.ts';

/** Below this, the text parse is not a table of contents and the model is asked. */
export const MIN_USEFUL_ENTRIES = 4;

/**
 * Magazine furniture. These appear in every sommaire and none of them is a
 * recipe; listing them as candidates would send the pipeline to read the
 * editorial and the subscription form.
 */
const NOT_A_RECIPE =
  /^(edito|editorial|sommaire|sumario|indice|contents|abonnement|assinatura|courrier|cartas|agenda|news|actus|atualidades|shopping|carnet|adresses|enderecos|ours|impressum|publicite|publicidade|jeu concours|concurso|horoscope|abonnez|abonne|nos partenaires|expediente)\b/;

/**
 * Course names, which an index prints as section headers with a page number —
 * "Entrées 12" — and which look exactly like a one-word recipe title. Listed
 * rather than inferred, because "Gaspacho 53" is also one word and *is* a dish.
 */
const COURSE_HEADING =
  /^(entrees?|plats?|desserts?|aperitifs?|boissons?|entradas?|pratos?|sobremesas?|bebidas?|petiscos?|antipasti|primi|secondi|dolci|starters?|mains?|drinks?|sides?|postres?|platos?|vorspeisen|hauptgerichte|nachspeisen)$/;

/** "Gaspacho ............ 53", "Gaspacho    53", "Gaspacho, p. 53". */
const ENTRY =
  /^(?<title>\p{L}[^\n]{2,88}?)[\s.,·…]*(?:p\.?|pag\.?|page|pagina)?[\s.…]*(?<folio>\d{1,3})\s*$/u;

/**
 * Parses one index page's text into title/page pairs.
 *
 * Titles are taken verbatim, minus the dot leaders. Nothing is translated and
 * nothing is title-cased: "GAMBAS PANÉES ET SAUCE AU CITRON VERT" is how the
 * magazine wrote it, and matching it against the extracted recipe later is a
 * comparison of folded strings anyway.
 */
export function readIndexFromText(text: string): RecipeIndexEntry[] {
  const entries: RecipeIndexEntry[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length < 6) continue;

    const match = ENTRY.exec(line);
    const groups = match?.groups;
    if (!groups) continue;

    const title = cleanTitle(groups['title'] ?? '');
    const folio = Number.parseInt(groups['folio'] ?? '', 10);
    if (!title || !Number.isFinite(folio) || folio < 1) continue;
    // A title of one short word is a section header ("Entrées 12"), not a dish.
    if (title.length < 4) continue;
    const folded = fold(title);
    if (NOT_A_RECIPE.test(folded)) continue;
    if (COURSE_HEADING.test(folded)) continue;

    entries.push({ title, folio });
  }

  return dedupe(entries);
}

function cleanTitle(raw: string): string {
  return squish(raw.replace(/[.·…_\-\s]+$/u, '').replace(/^[•\-–—*·\s]+/u, ''));
}

/**
 * Same dish, same page, once.
 *
 * A two-column index frequently repeats a title across the fold, and the model
 * pass and the text pass overlap by design — so this runs on the union of both.
 */
export function dedupe(entries: RecipeIndexEntry[]): RecipeIndexEntry[] {
  const seen = new Set<string>();
  const out: RecipeIndexEntry[] = [];
  for (const entry of entries) {
    const key = `${fold(entry.title)}@${entry.folio}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** The index from the text and the index from the model, as one list. */
export function mergeIndexes(
  fromText: RecipeIndexEntry[],
  fromModel: RecipeIndexEntry[],
): RecipeIndexEntry[] {
  return dedupe([...fromText, ...fromModel]).sort((a, b) => a.folio - b.folio);
}

/**
 * Which index entry, if any, announced this recipe.
 *
 * Never an exact comparison, because the two strings are typeset by different
 * people: the index prints "Gambas panées et sauce au citron vert" and the
 * recipe page prints "GAMBAS PANÉES & SAUCE AU CITRON VERT". Case, accents,
 * punctuation and the little joining words all differ, and none of them carries
 * meaning here.
 *
 * So titles are compared as **sets of content words** — tokens of three letters
 * or more, which drops "et", "au", "de", "&" — and a match requires one set to
 * contain the other with at least three words in common. That is what keeps
 * "Tarte" from matching both "Tarte aux pommes" and "Tarte au citron": one
 * content word is not a claim.
 */
export function findIndexEntry(
  title: string,
  entries: RecipeIndexEntry[],
): RecipeIndexEntry | null {
  const needle = normalize(title);
  if (needle.text.length < 4) return null;

  for (const entry of entries) {
    const hay = normalize(entry.title);
    if (hay.text === needle.text) return entry;

    const [small, large] =
      hay.words.size < needle.words.size ? [hay.words, needle.words] : [needle.words, hay.words];
    if (small.size < 3) continue;
    if ([...small].every((word) => large.has(word))) return entry;
  }
  return null;
}

/** A title reduced to what actually identifies the dish. */
function normalize(title: string): { text: string; words: Set<string> } {
  const text = fold(title)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, words: new Set(text.split(' ').filter((word) => word.length >= 3)) };
}
