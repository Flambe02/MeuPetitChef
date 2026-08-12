/**
 * String plumbing shared by every parser.
 *
 * Recipe sites write numbers the way a cookbook does — "½", "1 1/2", "0,5" —
 * and a parser that only understands `parseFloat` silently drops half of them.
 */

/** Unicode vulgar fractions, as they actually appear in French recipe pages. */
const VULGAR_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 0.1,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/** Collapses whitespace and trims. HTML text nodes arrive full of newlines. */
export function squish(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/** Lowercase, accent-free. Mirrors `public.mpc_normalize` in Postgres. */
export function fold(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Mirrors `public.mpc_slugify`, so a slug is the same on both sides. */
export function slugify(input: string): string {
  return fold(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Reads the first number out of a fragment.
 *
 * Handles "500", "0.5", "0,5", "½", "1 ½", "1 1/2" and "2-3" (which becomes 2 —
 * the low end of a range is the safe reading for a shopping list). Returns null
 * rather than NaN so callers can tell "no quantity" from "zero".
 */
export function parseNumber(input: string): number | null {
  const text = squish(input);
  if (!text) return null;

  // "1 ½" / "1 1/2" — a whole part followed by a fraction.
  const mixed = /^(\d+)\s*(?:([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])|(\d+)\s*\/\s*(\d+))/.exec(text);
  if (mixed) {
    const whole = Number(mixed[1]);
    if (mixed[2]) return whole + (VULGAR_FRACTIONS[mixed[2]] ?? 0);
    const numerator = Number(mixed[3]);
    const denominator = Number(mixed[4]);
    if (denominator > 0) return whole + numerator / denominator;
  }

  const bare = /^([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/.exec(text);
  if (bare?.[1]) return VULGAR_FRACTIONS[bare[1]] ?? null;

  const fraction = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator > 0) return Number(fraction[1]) / denominator;
  }

  // "1,5" and "1.5" both mean one and a half; "1 200" is one thousand two hundred.
  const decimal = /(\d+(?:[  ]\d{3})*(?:[.,]\d+)?)/.exec(text);
  if (!decimal?.[1]) return null;
  const value = Number(decimal[1].replace(/[  ]/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Uppercases the first letter without touching the rest ("cuire" → "Cuire"). */
export function capitalize(input: string): string {
  const text = squish(input);
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The first verb of an instruction, used as the cook-mode headline.
 *
 * Purely positional — no verb dictionary. Recipe instructions are imperative by
 * convention in every language this touches, so the first word is the verb, and
 * a wrong guess costs a headline rather than a step.
 */
export function leadingVerb(instruction: string): string | null {
  const first = /^\s*([\p{L}’']+)/u.exec(instruction)?.[1];
  if (!first || first.length < 3) return null;
  return capitalize(first);
}

/** Trims a title down to something that fits a slug column. */
export function truncate(input: string, max: number): string {
  const text = squish(input);
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
