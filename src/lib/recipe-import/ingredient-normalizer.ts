/**
 * Ingredient lines → canonical ingredient rows.
 *
 * Two source grammars cover every site seen so far:
 *
 *   name-first    "Crème fraîche épaisse - 500 grammes"   (Cookomix JSON-LD)
 *   amount-first  "100 g Weizenkörner" / "2 cuillères à soupe d'huile d'olive"
 *
 * and the DOM path hands the two halves over already split, which is always
 * preferred when available.
 *
 * No translation happens here. `sourceName` is what the site wrote and
 * `normalizedName` stays null until the Brazilian adaptation pass runs — a
 * mechanical "crème fraîche épaisse" → "creme de leite" would be a guess baked
 * into the catalogue, and unbaking it later is impossible.
 */
import type { CanonicalIngredient, RawIngredientLine } from './types.ts';
import { fold, squish } from './text.ts';
import { isScalable, matchUnitPrefix, parseAmount } from './units.ts';

const OPTIONAL =
  /\b(facultatif|facultative|optionnel|optional|opcional|se quiser|si vous voulez)\b/;
/** Articles that separate a unit from the ingredient name across languages. */
const LEADING_ARTICLE = /^(?:de la |de l['’]|des |du |de |d['’]|of |von |da |de |do |dos |das )/i;

/** Pulls "(à ajuster en fonction des goûts)" off the end into a note. */
function splitNote(text: string): { name: string; note: string | null } {
  const notes: string[] = [];
  const name = squish(
    text.replace(/\(([^)]*)\)/g, (_match, inner: string) => {
      notes.push(squish(inner));
      return ' ';
    }),
  );
  return { name, note: notes.length > 0 ? notes.join(' · ') : null };
}

/**
 * Splits an amount-first line into its amount and its name.
 *
 * The unit is what makes this hard: "2 cuillères à soupe d'huile d'olive" has a
 * three-word unit, and cutting after the number would leave "cuillères à soupe
 * d'huile d'olive" as the ingredient.
 */
function splitAmountFirst(text: string): { amountText: string; name: string } | null {
  const match =
    /^\s*((?:\d+(?:[.,]\d+)?|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?:\s*(?:[¼½¾⅓⅔⅛]|\d+\s*\/\s*\d+))?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s+(.*)$/u.exec(
      text,
    );
  if (!match?.[1] || !match[2]) return null;

  const quantityText = match[1];
  const words = squish(match[2]).split(' ');
  const unit = matchUnitPrefix(words);

  if (!unit) {
    // "1 échalote", "1 courgette coupée en morceaux" — a count with no unit word.
    return { amountText: quantityText, name: squish(words.join(' ')) };
  }

  const rest = words.slice(unit.consumed).join(' ');
  return {
    amountText: `${quantityText} ${words.slice(0, unit.consumed).join(' ')}`,
    name: squish(rest.replace(LEADING_ARTICLE, '')),
  };
}

/**
 * Name-first, the shape Cookomix's JSON-LD uses.
 *
 * The separator is a hyphen surrounded by spaces, which is safe because
 * ingredient names hyphenate without spaces ("demi-sel", "pommes-de-terre").
 * Only splits when the right-hand side actually starts with a quantity, so
 * "Sucre - vanille" stays one name.
 */
function splitNameFirst(text: string): { amountText: string; name: string } | null {
  const index = text.lastIndexOf(' - ');
  if (index <= 0) return null;
  const name = squish(text.slice(0, index));
  const amountText = squish(text.slice(index + 3));
  if (!name || !amountText) return null;
  if (!/^[\d¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/u.test(amountText)) return null;
  return { amountText, name };
}

/** One raw line → one canonical ingredient. */
export function normalizeIngredient(
  line: RawIngredientLine,
  position: number,
): CanonicalIngredient {
  const text = squish(line.text);

  let amountText = squish(line.amountText ?? '');
  let nameText = squish(line.name ?? '');

  if (!nameText) {
    const split = splitNameFirst(text) ?? splitAmountFirst(text);
    if (split) {
      amountText ||= split.amountText;
      nameText = split.name;
    } else {
      nameText = text;
    }
  }

  const amount = parseAmount(amountText);
  const { name, note } = splitNote(nameText);

  const notes = [note, line.alternativeText ? `Alternativa: ${line.alternativeText}` : null]
    .filter((entry): entry is string => Boolean(entry))
    .join(' · ');

  const unitKind = amount.unitKind;

  return {
    position,
    groupName: line.groupName ?? null,
    sourceName: name || text,
    sourceQuantity: amount.sourceQuantity,
    sourceUnit: amount.sourceUnit,
    normalizedName: null,
    quantity: amount.quantity,
    unit: amount.unit,
    unitKind,
    note: notes || null,
    isOptional: OPTIONAL.test(fold(text)),
    isScalable: isScalable(unitKind),
  };
}

export function normalizeIngredients(lines: RawIngredientLine[]): CanonicalIngredient[] {
  return lines
    .filter((line) => squish(line.text ?? line.name ?? '').length > 0)
    .map((line, index) => normalizeIngredient(line, index));
}
