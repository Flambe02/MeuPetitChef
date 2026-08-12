import type { IngredientLine, UnitKind } from './types';

/**
 * Portion scaling.
 *
 * Multiplying every number by 1.5 produces nonsense in a kitchen — "1,5 ovos",
 * "1,5 pitadas", "127 g de queijo". Rounding is therefore per unit kind:
 *
 *   to_taste / pinch  never scale at all
 *   count             whole numbers, never below 1
 *   mass / volume     nearest 5, never below 5
 *   spoon             nearest half
 */
export function scaleQuantity(
  quantity: number | null,
  unitKind: UnitKind,
  factor: number,
): number | null {
  if (quantity === null) return null;
  if (unitKind === 'to_taste' || unitKind === 'pinch') return quantity;
  if (factor === 1) return quantity;

  const scaled = quantity * factor;

  switch (unitKind) {
    case 'count':
      return Math.max(1, Math.round(scaled));
    case 'mass':
    case 'volume':
      return Math.max(5, Math.round(scaled / 5) * 5);
    case 'spoon':
      return Math.max(0.5, Math.round(scaled * 2) / 2);
    default:
      return Math.round(scaled * 100) / 100;
  }
}

/** Formats a number the Brazilian way: comma decimal, no trailing zeros. */
export function formatQuantity(quantity: number | null): string {
  // Zero is not a quantity, it is the absence of one — and it reaches here
  // often, because "sal a gosto" is stored as 0 with the unit carrying the
  // whole meaning. Printed, it read "0 a gosto".
  if (quantity === null || quantity === 0) return '';
  const rounded = Math.round(quantity * 100) / 100;
  return String(rounded).replace('.', ',');
}

/** "500 ml", "2 c. sopa", "1 pitada" — the string an ingredient row prints. */
export function formatAmount(quantity: number | null, unit: string | null): string {
  const value = formatQuantity(quantity);
  if (!value) return unit ?? '';
  return unit ? `${value} ${unit}` : value;
}

/** Applies a serving factor to a whole ingredient line, honouring is_scalable. */
export function scaleLine(line: IngredientLine, factor: number): IngredientLine {
  if (!line.isScalable) return line;
  return { ...line, quantity: scaleQuantity(line.quantity, line.unitKind, factor) };
}

/** Serving factor, guarded against a zero or missing base. */
export function servingFactor(targetServings: number, baseServings: number): number {
  if (!baseServings || baseServings <= 0) return 1;
  return targetServings / baseServings;
}
