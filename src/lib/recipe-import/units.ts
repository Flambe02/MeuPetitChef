/**
 * Unit normalization.
 *
 * The rule from the brief, and the right one: never destroy the source. Every
 * ingredient keeps `sourceQuantity` / `sourceUnit` exactly as written, and the
 * normalized pair is an *addition*. When a unit is not recognised it is carried
 * through as text with the best-guess `unit_kind` rather than dropped — the
 * recipe still has to read correctly on screen.
 *
 * `unit_kind` is the enum the database uses to decide scaling behaviour:
 * `mass`/`volume` round to 5, `count` rounds to whole units, `pinch` and
 * `to_taste` never scale at all.
 */
import type { UnitKind } from '@/domain/types';

import { fold, parseNumber, squish } from './text.ts';

export interface ParsedAmount {
  quantity: number | null;
  /** Canonical symbol ('g', 'ml', 'tsp'…) or the source noun when unrecognised. */
  unit: string | null;
  unitKind: UnitKind;
  sourceQuantity: string | null;
  sourceUnit: string | null;
  /** True when the source unit survived unchanged because we could not map it. */
  isUnitVerbatim: boolean;
}

interface UnitRule {
  unit: string;
  kind: UnitKind;
  /** Multiplies the quantity when the canonical unit differs from the source. */
  factor?: number;
}

/**
 * Spellings → canonical unit. Keys are folded (lowercase, accent-free) and
 * matched exactly, so "Grammes" and "grammes" are one entry.
 *
 * Covers fr (Cookomix), pt-BR (our own content), de/en (Cookidoo's locales).
 */
const UNITS: Record<string, UnitRule> = {
  // ── mass ────────────────────────────────────────────────────────────────
  g: { unit: 'g', kind: 'mass' },
  gr: { unit: 'g', kind: 'mass' },
  gramme: { unit: 'g', kind: 'mass' },
  grammes: { unit: 'g', kind: 'mass' },
  gram: { unit: 'g', kind: 'mass' },
  grams: { unit: 'g', kind: 'mass' },
  grama: { unit: 'g', kind: 'mass' },
  gramas: { unit: 'g', kind: 'mass' },
  kg: { unit: 'kg', kind: 'mass' },
  kilo: { unit: 'kg', kind: 'mass' },
  kilos: { unit: 'kg', kind: 'mass' },
  kilogramme: { unit: 'kg', kind: 'mass' },
  kilogrammes: { unit: 'kg', kind: 'mass' },
  quilo: { unit: 'kg', kind: 'mass' },
  quilos: { unit: 'kg', kind: 'mass' },
  mg: { unit: 'g', kind: 'mass', factor: 0.001 },

  // ── volume ──────────────────────────────────────────────────────────────
  ml: { unit: 'ml', kind: 'volume' },
  millilitre: { unit: 'ml', kind: 'volume' },
  millilitres: { unit: 'ml', kind: 'volume' },
  mililitro: { unit: 'ml', kind: 'volume' },
  mililitros: { unit: 'ml', kind: 'volume' },
  cl: { unit: 'ml', kind: 'volume', factor: 10 },
  dl: { unit: 'ml', kind: 'volume', factor: 100 },
  l: { unit: 'l', kind: 'volume' },
  litre: { unit: 'l', kind: 'volume' },
  litres: { unit: 'l', kind: 'volume' },
  litro: { unit: 'l', kind: 'volume' },
  litros: { unit: 'l', kind: 'volume' },

  // ── spoons and cups ─────────────────────────────────────────────────────
  // Spoons stay spoons: converting "1 c. à café" to 5 ml is a kitchen
  // convention, not a fact, and `unit_kind = 'spoon'` exists precisely so the
  // app can scale them without pretending they are volumes.
  'cuillere a cafe': { unit: 'tsp', kind: 'spoon' },
  'cuilleres a cafe': { unit: 'tsp', kind: 'spoon' },
  'c a cafe': { unit: 'tsp', kind: 'spoon' },
  cac: { unit: 'tsp', kind: 'spoon' },
  'cuillere a the': { unit: 'tsp', kind: 'spoon' },
  'colher de cha': { unit: 'tsp', kind: 'spoon' },
  'colheres de cha': { unit: 'tsp', kind: 'spoon' },
  tsp: { unit: 'tsp', kind: 'spoon' },
  teaspoon: { unit: 'tsp', kind: 'spoon' },
  teaspoons: { unit: 'tsp', kind: 'spoon' },
  tl: { unit: 'tsp', kind: 'spoon' },
  teeloffel: { unit: 'tsp', kind: 'spoon' },

  'cuillere a soupe': { unit: 'tbsp', kind: 'spoon' },
  'cuilleres a soupe': { unit: 'tbsp', kind: 'spoon' },
  'c a soupe': { unit: 'tbsp', kind: 'spoon' },
  cas: { unit: 'tbsp', kind: 'spoon' },
  'colher de sopa': { unit: 'tbsp', kind: 'spoon' },
  'colheres de sopa': { unit: 'tbsp', kind: 'spoon' },
  tbsp: { unit: 'tbsp', kind: 'spoon' },
  tablespoon: { unit: 'tbsp', kind: 'spoon' },
  tablespoons: { unit: 'tbsp', kind: 'spoon' },
  el: { unit: 'tbsp', kind: 'spoon' },
  essloffel: { unit: 'tbsp', kind: 'spoon' },

  xicara: { unit: 'xícara', kind: 'volume' },
  xicaras: { unit: 'xícara', kind: 'volume' },
  cup: { unit: 'xícara', kind: 'volume' },
  cups: { unit: 'xícara', kind: 'volume' },
  tasse: { unit: 'xícara', kind: 'volume' },
  tasses: { unit: 'xícara', kind: 'volume' },

  // ── pinches ─────────────────────────────────────────────────────────────
  pincee: { unit: 'pitada', kind: 'pinch' },
  pincees: { unit: 'pitada', kind: 'pinch' },
  pitada: { unit: 'pitada', kind: 'pinch' },
  pitadas: { unit: 'pitada', kind: 'pinch' },
  pinch: { unit: 'pitada', kind: 'pinch' },
  pinches: { unit: 'pitada', kind: 'pinch' },
  prise: { unit: 'pitada', kind: 'pinch' },
  prisen: { unit: 'pitada', kind: 'pinch' },
};

/** Phrases that mean "as much as you like" — never scaled, never quantified. */
const TO_TASTE =
  /\b(a gosto|au gout|selon (?:les |vos )?gouts?|a ajuster|to taste|q\.?\s?b\.?|nach geschmack)\b/;

/**
 * The longest unit spelling is four words ("cuillère à café bombée" folds to
 * three that we match); scanning from longest to shortest stops
 * "cuillère à soupe" from matching as "cuillère".
 */
const UNIT_KEYS_BY_LENGTH = Object.keys(UNITS).sort(
  (a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length,
);

function foldUnit(input: string): string {
  return fold(input).replace(/\./g, ' ').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Maps a bare unit fragment ("cuillères à soupe") to its canonical form. */
export function normalizeUnit(input: string | null | undefined): UnitRule | null {
  if (!input) return null;
  const key = foldUnit(input);
  if (!key) return null;
  return UNITS[key] ?? null;
}

/**
 * Splits an amount fragment into a quantity and a unit.
 *
 * Input is the *amount* only — "500 grammes", "0.5 cuillère à café", "2
 * pincées", "1 ½ TL", "1". Ingredient *lines* go through
 * `ingredient-normalizer`, which finds the amount first and calls this.
 */
export function parseAmount(input: string | null | undefined): ParsedAmount {
  const text = squish(input ?? '');
  if (!text) {
    return {
      quantity: null,
      unit: null,
      unitKind: 'count',
      sourceQuantity: null,
      sourceUnit: null,
      isUnitVerbatim: false,
    };
  }

  if (TO_TASTE.test(fold(text))) {
    return {
      quantity: null,
      unit: null,
      unitKind: 'to_taste',
      sourceQuantity: null,
      sourceUnit: text,
      isUnitVerbatim: true,
    };
  }

  // The leading number, however it is written, and whatever follows it.
  const split =
    /^\s*((?:\d+(?:[.,]\d+)?|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?:\s*(?:[¼½¾⅓⅔⅛]|\d+\s*\/\s*\d+))?(?:\s*[-–à]\s*\d+(?:[.,]\d+)?)?)\s*(.*)$/u.exec(
      text,
    );

  const quantityText = split?.[1]?.trim() ?? null;
  const unitText = squish(split?.[2] ?? (quantityText ? '' : text));
  const quantity = quantityText ? parseNumber(quantityText) : null;

  if (!unitText) {
    return {
      quantity,
      unit: null,
      unitKind: 'count',
      sourceQuantity: quantityText,
      sourceUnit: null,
      isUnitVerbatim: false,
    };
  }

  const folded = foldUnit(unitText);
  for (const key of UNIT_KEYS_BY_LENGTH) {
    if (folded === key || folded.startsWith(`${key} `)) {
      const rule = UNITS[key];
      if (!rule) continue;
      const scaled = quantity !== null && rule.factor ? quantity * rule.factor : quantity;
      return {
        quantity: scaled,
        unit: rule.unit,
        unitKind: rule.kind,
        sourceQuantity: quantityText,
        sourceUnit: unitText,
        isUnitVerbatim: false,
      };
    }
  }

  // Unrecognised: "gousse", "sachet", "Würfel", "Stück". These are countable
  // nouns, so the line reads correctly with the noun kept verbatim.
  return {
    quantity,
    unit: unitText,
    unitKind: 'count',
    sourceQuantity: quantityText,
    sourceUnit: unitText,
    isUnitVerbatim: true,
  };
}

/** 1 kcal = 4.184 kJ. */
const KJ_PER_KCAL = 4.184;

/**
 * Energy, always in kcal.
 *
 * Cookidoo prints both units in one string — "788.3 kJ / 188.4 kcal" — and
 * reading the first number gives a recipe four times too rich. So kcal wins
 * when present, kJ is converted when it is alone, and a bare number is assumed
 * to be kcal (which is what schema.org's `calories` means).
 */
export function parseEnergyKcal(input: string | null | undefined): number | null {
  const text = squish(input ?? '');
  if (!text) return null;

  const kcal = /(\d+(?:[.,]\d+)?)\s*k?cal/i.exec(text);
  if (kcal) return parseNumber(kcal[1] ?? '');

  const kilojoules = /(\d+(?:[.,]\d+)?)\s*kj/i.exec(text);
  if (kilojoules) {
    const value = parseNumber(kilojoules[1] ?? '');
    return value === null ? null : Math.round((value / KJ_PER_KCAL) * 10) / 10;
  }

  return parseNumber(text);
}

/**
 * Every unit the table can produce. A `unit` outside this set is a source noun
 * that survived verbatim, which is what the "not converted" warning reports.
 */
export const CANONICAL_UNITS: ReadonlySet<string> = new Set(
  Object.values(UNITS).map((rule) => rule.unit),
);

/**
 * Matches a unit spelled across the first words of a fragment.
 *
 * Needed by the amount-first ingredient form ("2 cuillères à soupe d'huile
 * d'olive"), where the unit is three words long and the name starts right
 * after it. Returns how many words were consumed so the caller can slice.
 */
export function matchUnitPrefix(words: string[]): { rule: UnitRule; consumed: number } | null {
  for (let take = Math.min(4, words.length); take >= 1; take -= 1) {
    const rule = UNITS[foldUnit(words.slice(0, take).join(' '))];
    if (rule) return { rule, consumed: take };
  }
  return null;
}

/** `pinch` and `to_taste` lines must not multiply when servings change. */
export function isScalable(kind: UnitKind): boolean {
  return kind !== 'pinch' && kind !== 'to_taste';
}
