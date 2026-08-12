/**
 * The printed page number, and why it is not the file position.
 *
 * A magazine's index says "Gaspacho ... 53". The PDF's 53rd page is almost never
 * that page: the cover, the inside cover and the first spread of advertising are
 * usually unnumbered, so the printed folio runs three or four ahead of the file
 * position. Following the index literally therefore extracts an advert, reports
 * "no recipe found on page 53", and leaves the actual recipe unread.
 *
 * The offset is not guessed from a rule — magazines disagree about how many
 * front pages to skip. It is *measured*: read the folio actually printed on as
 * many pages as possible, and take the offset that most of them agree on.
 */
import type { MagazinePage } from './types.ts';

/** Nothing in a cooking magazine is numbered beyond this. */
const MAX_FOLIO = 999;
/** Below this many agreeing pages, the offset is a coincidence, not a pattern. */
const MIN_AGREEMENT = 3;

/**
 * The folio printed on one page, or null.
 *
 * Only the first and last two lines are considered: that is where a folio is
 * set, and scanning the whole page would happily read "180" out of "180 °C".
 */
export function readFolio(text: string): number | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const candidates = [...lines.slice(0, 2), ...lines.slice(-2)];
  for (const line of candidates) {
    // A folio stands alone. It may sit beside the magazine's name — "RÉGAL 53"
    // or "53 RÉGAL" — but never inside a sentence.
    const match = /^(?:[^\d\n]{0,24}?\s)?(\d{1,3})(?:\s[^\d\n]{0,24})?$/.exec(line);
    const found = match?.[1];
    if (!found) continue;
    const folio = Number.parseInt(found, 10);
    if (folio >= 1 && folio <= MAX_FOLIO) return folio;
  }
  return null;
}

/**
 * How far the printed numbering runs ahead of the file.
 *
 * `folio = index + offset`. Returns null when too few pages carry a readable
 * folio to be sure — in which case the pipeline falls back to treating index
 * numbers as file positions and says so in the log, rather than silently
 * shifting every page by a number it invented.
 */
export function detectFolioOffset(pages: MagazinePage[]): number | null {
  const tally = new Map<number, number>();

  for (const page of pages) {
    const folio = page.folio ?? readFolio(page.text);
    if (folio === null) continue;
    const offset = folio - page.index;
    tally.set(offset, (tally.get(offset) ?? 0) + 1);
  }

  let best: { offset: number; count: number } | null = null;
  for (const [offset, count] of tally) {
    if (!best || count > best.count) best = { offset, count };
  }

  if (!best || best.count < MIN_AGREEMENT) return null;
  return best.offset;
}

/** A printed page number → the file position to actually open. */
export function folioToIndex(folio: number, offset: number | null, pageCount: number): number {
  const index = folio - (offset ?? 0);
  return Math.min(Math.max(index, 1), pageCount);
}
