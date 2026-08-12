/**
 * Temperature parsing.
 *
 * "Varoma" is not a number. It is the Thermomix's steam setting — physically
 * around 120 °C at the bowl, but the machine displays a word and the recipe
 * writes a word, so the parser returns a word. Collapsing it to 120 would make
 * "Cuire 15 min/Varoma" and "Cuire 15 min/120°C" indistinguishable, and they
 * are not: one steams in the Varoma dish, the other heats the bowl.
 */
import { parseNumber, squish } from './text.ts';

export type Temperature = number | 'varoma';

/** The plausible range for a domestic appliance; mirrors the DB check (0–350). */
const MIN_C = 0;
const MAX_C = 350;

const VAROMA = /\bvaroma\b/i;

/** True when the fragment names the Varoma setting rather than a number. */
export function isVaroma(input: string): boolean {
  return VAROMA.test(input);
}

/**
 * Reads a temperature out of a fragment: "120°", "120°C", "120 C", "210 °C",
 * "37°C", "Varoma", "à 240°C", "250 °F".
 *
 * Fahrenheit is converted — BBC Good Food and US sources will need it, and a
 * raw 400 would fail the database's 0–350 check anyway.
 */
export function parseTemperature(input: string | null | undefined): Temperature | null {
  if (!input) return null;
  const text = squish(input);
  if (!text) return null;
  if (isVaroma(text)) return 'varoma';

  const match =
    /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*|º\s*|graus?\s*|degrees?\s*)?([cCfF])?(?![\p{L}\d])/u.exec(text);
  if (!match) return null;

  const value = parseNumber(match[1] ?? '');
  if (value === null) return null;

  const isFahrenheit = match[2]?.toLowerCase() === 'f';
  const celsius = isFahrenheit ? ((value - 32) * 5) / 9 : value;
  const rounded = Math.round(celsius);
  return rounded >= MIN_C && rounded <= MAX_C ? rounded : null;
}

/**
 * Only accepts a temperature when the fragment actually announces one.
 *
 * `parseTemperature` will happily read "20" out of "Cuire 20 min", which is the
 * right behaviour for a fragment already known to be a temperature and the
 * wrong one for a whole sentence. Sentence-level callers use this.
 */
export function findTemperature(sentence: string): Temperature | null {
  if (isVaroma(sentence)) return 'varoma';
  const match = /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*[cCfF]?|º\s*[cCfF]?|\s[cC](?![\p{L}])|graus)/u.exec(
    sentence,
  );
  return match ? parseTemperature(match[0]) : null;
}

/** What the dial prints: "120 °C" or "Varoma". */
export function formatTemperature(value: Temperature | null): string | null {
  if (value === null) return null;
  return value === 'varoma' ? 'Varoma' : `${value} °C`;
}
