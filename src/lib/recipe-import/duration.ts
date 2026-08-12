/**
 * Duration parsing. The internal representation is always seconds.
 *
 * Real inputs this has to survive, taken from live Cookomix and Cookidoo pages:
 *
 *   "PT40M"                ISO-8601, what schema.org gives
 *   "5 sec" / "5 secondes"
 *   "3 min 30 sec"         two units in one string
 *   "02 h 00 min"          zero-padded, spaced
 *   "1 h 20"               trailing bare number means minutes
 *   "00:05"                mm:ss
 *   "10 minutes"           spelled out, fr / pt / en / de
 */
import { parseNumber, squish } from './text.ts';

/** Unit spellings, folded to lowercase-no-accent before matching. */
const SECOND = /^(s|sec|secs|seg|segs|second|seconds|secondes|seconde|segundo|segundos|sek)$/;
const MINUTE = /^(m|min|mins|minute|minutes|minuto|minutos|minuten|mn)$/;
const HOUR = /^(h|hr|hrs|hour|hours|heure|heures|hora|horas|std|stunden)$/;

function unitSeconds(unit: string): number | null {
  const key = unit
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\./g, '');
  if (SECOND.test(key)) return 1;
  if (MINUTE.test(key)) return 60;
  if (HOUR.test(key)) return 3600;
  return null;
}

/** ISO-8601 durations, the schema.org form. Days are folded into hours. */
export function parseIsoDuration(input: string): number | null {
  const match =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
      squish(input),
    );
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  if (!days && !hours && !minutes && !seconds) return null;
  const total =
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return Number.isFinite(total) && total > 0 ? Math.round(total) : null;
}

/**
 * Any duration a recipe writes, in seconds. Null when there is no duration —
 * which is different from zero, and callers depend on the difference.
 *
 * Multiple units add up ("3 min 30 sec" → 210). A bare trailing number after an
 * hour is read as minutes ("1 h 20" → 4800), which is how French recipes write
 * it; a bare number with no unit at all is *not* a duration and returns null,
 * because "Cuire 20" means nothing and guessing minutes would invent a timer.
 */
export function parseDuration(input: string | null | undefined): number | null {
  if (!input) return null;
  const text = squish(input);
  if (!text) return null;

  const iso = parseIsoDuration(text);
  if (iso !== null) return iso;

  // "00:05" — mm:ss, or hh:mm:ss with three parts.
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (clock) {
    const a = Number(clock[1]);
    const b = Number(clock[2]);
    if (clock[3] !== undefined) return a * 3600 + b * 60 + Number(clock[3]);
    return a * 60 + b;
  }

  let total = 0;
  let matched = false;
  let lastUnit: number | null = null;

  const pattern = /(\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛])\s*([\p{L}]+\.?)?/gu;
  for (const match of text.matchAll(pattern)) {
    const value = parseNumber(match[1] ?? '');
    if (value === null) continue;
    const unit = match[2] ? unitSeconds(match[2]) : null;

    if (unit !== null) {
      total += value * unit;
      matched = true;
      lastUnit = unit;
      continue;
    }
    // A bare number only counts when it trails a bigger unit: "1 h 20".
    if (matched && lastUnit !== null && lastUnit > 60) {
      total += value * 60;
      lastUnit = 60;
    }
  }

  if (!matched) return null;
  return Math.round(total);
}

/**
 * Finds the first duration inside a whole sentence.
 *
 * `parseDuration` is for a fragment already known to be a duration; this is for
 * "Transvaser dans un saladier et réserver pendant 02 h 00 min." It only
 * matches numbers that carry a time unit, so "Ajouter 2 pincées de poivre"
 * yields nothing rather than two seconds.
 */
export function findDuration(sentence: string): number | null {
  const pattern =
    /\d+\s*(?:h|hr|hrs|heures?|horas?|std|stunden?)\s*(?:\d+\s*(?:m|min|mins|minutes?|minutos?|mn)?)?|\d+\s*(?:m|min|mins|minutes?|minutos?|mn)\.?\s*(?:\d+\s*(?:s|sec|secs|seg|segs|sek|secondes?|segundos?)\.?)?|\d+\s*(?:sec|secs|seg|segs|sek|secondes?|segundos?)\.?/i;
  const match = pattern.exec(squish(sentence));
  return match ? parseDuration(match[0]) : null;
}

/** Seconds → whole minutes, rounded up: the unit every `*_minutes` column uses. */
export function toMinutes(seconds: number | null): number | null {
  if (seconds === null) return null;
  return Math.max(1, Math.ceil(seconds / 60));
}

/** "1 h 05" / "12 min" / "30 s" — for previews and dial sub-labels, in pt-BR. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0)
    return minutes > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${hours} h`;
  if (minutes > 0) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${rest} s`;
}
