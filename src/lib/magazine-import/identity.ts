/**
 * Who published this, when, and in what language.
 *
 * All three are read off the cover's text layer, all three are guesses, and all
 * three land in **editable fields** rather than being applied silently. That is
 * the whole design: a wrong publication name costs one correction, while a
 * wrong one written straight into the provenance of eighty recipes costs an
 * afternoon.
 *
 * The language matters more than it looks. It decides whether the translation
 * pass is offered at all, and it is what tells the extraction prompt which
 * language *not* to translate out of.
 */
import { fold, squish } from '@/lib/recipe-import/text';

import type { MagazineIdentity, MagazinePage } from './types.ts';

/* ---------------------------------------------------------------------------
 * Language
 * ------------------------------------------------------------------------- */

/**
 * Function words, which is what makes this work on a cover.
 *
 * Cover lines are mostly nouns — "TARTES", "SAUMON", "BRUNCH" — and nouns
 * travel between languages. The little words do not: a page carrying "des",
 * "aux" and "pour" is French whatever the dish names say.
 */
const STOPWORDS: Record<string, readonly string[]> = {
  fr: ['des', 'aux', 'pour', 'avec', 'les', 'une', 'dans', 'notre', 'nos', 'recettes', 'facile'],
  pt: ['dos', 'das', 'para', 'com', 'uma', 'nossas', 'nossos', 'receitas', 'sabor', 'voce'],
  es: ['los', 'las', 'para', 'con', 'una', 'nuestras', 'recetas', 'sabor', 'muy'],
  it: ['dei', 'delle', 'per', 'con', 'una', 'nostre', 'ricette', 'sapore', 'facile'],
  en: ['the', 'with', 'for', 'your', 'our', 'recipes', 'easy', 'best', 'made'],
  de: ['der', 'die', 'das', 'und', 'mit', 'fur', 'unsere', 'rezepte', 'einfach'],
};

/**
 * The most likely language of a block of text, or `fallback` when nothing wins.
 *
 * Deliberately returns the fallback rather than a coin-flip: "we could not tell"
 * is a fact the admin can act on, and defaulting to French because French is
 * first in the object would be a bug that only shows up on Brazilian magazines.
 */
export function detectLanguage(text: string, fallback = 'fr'): string {
  const words = fold(text)
    .split(/[^a-z]+/)
    .filter((word) => word.length > 1);
  if (words.length < 8) return fallback;

  const counts = new Map<string, number>();
  for (const word of words) {
    for (const [language, stopwords] of Object.entries(STOPWORDS)) {
      if (stopwords.includes(word)) counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }

  let best: { language: string; count: number } | null = null;
  let runnerUp = 0;
  for (const [language, count] of counts) {
    if (!best || count > best.count) {
      runnerUp = best?.count ?? 0;
      best = { language, count };
    } else if (count > runnerUp) {
      runnerUp = count;
    }
  }

  // A one-word lead is noise — "para" is Portuguese *and* Spanish.
  if (!best || best.count < 3 || best.count - runnerUp < 2) return fallback;
  return best.language;
}

const COUNTRY: Record<string, string> = {
  fr: 'FR',
  pt: 'BR',
  es: 'ES',
  it: 'IT',
  en: 'GB',
  de: 'DE',
};

/** The country a language suggests. Editable, and often wrong for pt (PT vs BR). */
export function countryForLanguage(language: string): string | null {
  const base = language.split(/[-_]/)[0]?.toLowerCase() ?? '';
  return COUNTRY[base] ?? null;
}

/* ---------------------------------------------------------------------------
 * The cover
 * ------------------------------------------------------------------------- */

const ISSUE_PATTERNS: RegExp[] = [
  /\b(hors[-\s]?s[ée]rie|special|especial)\s*(?:n[°ºo.]?\s*)?(\d{1,4})\b/i,
  /\bn[°ºo.]\s*(\d{1,4})\b/i,
  /\bedi[çc][ãa]o\s*(?:n[°ºo.]?\s*)?(\d{1,4})\b/i,
  /\bissue\s*(?:no\.?\s*)?(\d{1,4})\b/i,
  /#(\d{1,4})\b/,
];

const MONTHS: Record<string, number> = {
  janvier: 1,
  janeiro: 1,
  enero: 1,
  gennaio: 1,
  january: 1,
  januar: 1,
  fevrier: 2,
  fevereiro: 2,
  febrero: 2,
  febbraio: 2,
  february: 2,
  februar: 2,
  mars: 3,
  marco: 3,
  marzo: 3,
  march: 3,
  marz: 3,
  avril: 4,
  abril: 4,
  aprile: 4,
  april: 4,
  mai: 5,
  maio: 5,
  mayo: 5,
  maggio: 5,
  may: 5,
  juin: 6,
  junho: 6,
  junio: 6,
  giugno: 6,
  june: 6,
  juni: 6,
  juillet: 7,
  julho: 7,
  julio: 7,
  luglio: 7,
  july: 7,
  juli: 7,
  aout: 8,
  agosto: 8,
  august: 8,
  septembre: 9,
  setembro: 9,
  septiembre: 9,
  settembre: 9,
  september: 9,
  octobre: 10,
  outubro: 10,
  octubre: 10,
  ottobre: 10,
  october: 10,
  oktober: 10,
  novembre: 11,
  novembro: 11,
  noviembre: 11,
  november: 11,
  decembre: 12,
  dezembro: 12,
  diciembre: 12,
  dicembre: 12,
  december: 12,
  dezember: 12,
};

/** "juin 2026" → "2026-06"; "06/2026" → "2026-06"; "2026" → "2026". */
export function readPublicationDate(text: string): string | null {
  const folded = fold(text);

  for (const [name, month] of Object.entries(MONTHS)) {
    const pattern = new RegExp(`\\b${name}\\b\\D{0,12}(19|20)(\\d{2})\\b`);
    const match = pattern.exec(folded);
    if (match) {
      return `${match[1] ?? ''}${match[2] ?? ''}-${String(month).padStart(2, '0')}`;
    }
  }

  const numeric = /\b(0?[1-9]|1[0-2])\s*[/.-]\s*((?:19|20)\d{2})\b/.exec(folded);
  if (numeric?.[1] && numeric[2]) {
    return `${numeric[2]}-${numeric[1].padStart(2, '0')}`;
  }

  const year = /\b((?:19|20)\d{2})\b/.exec(folded);
  return year?.[1] ?? null;
}

export function readIssue(text: string): string | null {
  for (const pattern of ISSUE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    // The hors-série pattern captures its label; the others only a number.
    const label = match.length > 2 ? squish(match[1] ?? '') : '';
    const number = match[match.length - 1];
    if (!number) continue;
    return squish(label ? `${capitalise(label)} N${number}` : `N°${number}`);
  }
  return null;
}

function capitalise(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

/**
 * The magazine's name, as best a cover allows.
 *
 * A cover's biggest words are the masthead, but a text layer has no font sizes —
 * so the heuristic is position and shape instead: among the first few lines, the
 * shortest all-caps one that is not a date, a price or a barcode. It is right
 * often enough to save typing and wrong often enough that the field is editable.
 */
export function readPublication(text: string): string | null {
  const lines = text
    .split('\n')
    .map((line) => squish(line))
    .filter((line) => line.length >= 3 && line.length <= 40)
    .slice(0, 10);

  const candidates = lines.filter((line) => {
    if (/\d{3,}/.test(line)) return false; // barcodes, prices, ISSNs
    if (readPublicationDate(line) !== null) return false;
    const letters = line.replace(/[^\p{L}]/gu, '');
    if (letters.length < 3) return false;
    return letters === letters.toUpperCase();
  });

  return candidates.sort((a, b) => a.length - b.length)[0] ?? lines[0] ?? null;
}

/** Everything the cover gives up, in one pass. All of it editable afterwards. */
export function readIdentityFromCover(cover: MagazinePage, pageCount: number): MagazineIdentity {
  const language = detectLanguage(cover.text);
  return {
    publication: readPublication(cover.text),
    issue: readIssue(cover.text),
    publicationDate: readPublicationDate(cover.text),
    language,
    country: countryForLanguage(language),
    pageCount,
  };
}
