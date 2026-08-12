/**
 * The join: a magazine recipe becomes an ordinary imported recipe.
 *
 * Everything below this line already exists. `normalizeRecipe` parses "250 g",
 * "1 c. à soupe", "45 min", "th. 7 (210 °C)" and a Thermomix programme; it
 * builds the single cooking path an import produces; it computes the fingerprint
 * and the deterministic slug. `saveImportedRecipe` writes the recipe, its
 * groups, ingredients, path, steps, dials and notes.
 *
 * So this file is short on purpose. Its whole job is to present a
 * `MagazineRecipe` as a `RawRecipe` — and the temptation it resists is
 * re-implementing any of the parsing "because a magazine is different". It is
 * not. A magazine prints "200 g de farine" exactly like a website does.
 *
 * One thing it *does* add, because nothing else can: provenance. A web import
 * carries a URL and `saveImportedRecipe` writes an attribution note from it. A
 * magazine has no URL, so the note is built here from the publication, the issue
 * and the printed page — §41's requirement, and the only record of where a
 * recipe came from once the import row is gone.
 */
import type {
  CanonicalRecipe,
  RawIngredientLine,
  RawRecipe,
  RawStepLine,
} from '@/lib/recipe-import/types';
import { emptyRawRecipe } from '@/lib/recipe-import/types';
import { normalizeRecipe } from '@/lib/recipe-import/recipe-normalizer';
import { slugify, squish } from '@/lib/recipe-import/text';

import type { MagazineIngredient, MagazineRecipe } from './types.ts';

/** Where the recipe was printed. Everything here ends up in the attribution. */
export interface MagazineProvenance {
  importId: string;
  publication: string | null;
  issue: string | null;
  /** `YYYY` or `YYYY-MM`. */
  publicationDate: string | null;
  language: string;
  /** Printed page numbers, in reading order. Falls back to file positions. */
  folios: number[];
}

const MINUTE = 60;

/** "Régal · Hors-Série N31 · p. 61" — the line a reviewer needs to check a fact. */
export function provenanceLabel(source: MagazineProvenance): string {
  const parts = [
    source.publication,
    source.issue,
    source.publicationDate,
    source.folios.length > 0 ? `p. ${source.folios.join('–')}` : null,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.join(' · ') || 'Revista importada';
}

/**
 * A stable identifier for this recipe within this magazine.
 *
 * Built from the issue and the page rather than from a random id, so
 * re-importing the same magazine lands on the same external id — and therefore
 * the same slug — instead of quietly creating a second copy of every recipe.
 */
export function magazineExternalId(source: MagazineProvenance, title: string): string {
  const issue = slugify(`${source.publication ?? ''} ${source.issue ?? ''}`) || source.importId;
  const page = source.folios[0];
  return `${issue}:${page === undefined ? slugify(title) : `p${String(page)}`}`;
}

function ingredientLine(line: MagazineIngredient): RawIngredientLine {
  const amountText = squish(
    [line.quantity === null ? '' : formatQuantity(line.quantity), line.unit ?? ''].join(' '),
  );
  // The preparation rides in parentheses because that is the one form the
  // shared normalizer already splits off into a note — "farinha (peneirada)".
  const name = squish(
    line.preparation ? `${line.ingredient} (${line.preparation})` : line.ingredient,
  );
  const optional = line.optional ? ' (opcional)' : '';

  return {
    text: squish(`${amountText} ${name}${optional}`),
    name: `${name}${optional}`,
    amountText: amountText || null,
  };
}

/** No exponent notation, no trailing zeros: "0.5" not "5e-1", "250" not "250.0". */
function formatQuantity(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function stepLine(instruction: string): RawStepLine {
  return { text: squish(instruction) };
}

/**
 * `MagazineRecipe` → `RawRecipe`.
 *
 * Times are converted to seconds because that is the unit the rest of the
 * pipeline speaks. `totalTimeSeconds` is left null when the magazine printed
 * only some of prep / cook / rest — the normalizer adds up what it has and
 * falls back to the step timers, which is a better answer than a total we made
 * up from an incomplete set.
 */
export function toRawRecipe(recipe: MagazineRecipe, source: MagazineProvenance): RawRecipe {
  const raw = emptyRawRecipe('magazine');

  const prep = recipe.prepMinutes === null ? null : recipe.prepMinutes * MINUTE;
  const cook = recipe.cookMinutes === null ? null : recipe.cookMinutes * MINUTE;
  const rest = recipe.restMinutes === null ? null : recipe.restMinutes * MINUTE;

  raw.title = recipe.title;
  raw.description = recipe.description;
  raw.language = recipe.language ?? source.language;
  raw.authorName = source.publication;
  raw.servings = recipe.servings;
  raw.prepTimeSeconds = prep;
  raw.cookTimeSeconds = cook;
  raw.totalTimeSeconds =
    prep === null && cook === null && rest === null
      ? null
      : (prep ?? 0) + (cook ?? 0) + (rest ?? 0);
  raw.externalId = magazineExternalId(source, recipe.title);
  raw.ingredients = recipe.ingredients.map(ingredientLine);
  raw.steps = recipe.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step) => stepLine(step.instruction));

  raw.notes = [
    ...recipe.tips.map((body) => ({ kind: 'tip', title: null, body })),
    ...recipe.notes.map((body) => ({ kind: 'tip', title: null, body })),
    // Provenance, always. The recipe may outlive its import row.
    { kind: 'tip', title: 'Fonte', body: provenanceLabel(source) },
  ];

  // Nothing is downloaded and nothing is linked: the magazine's photograph is a
  // crop in our private bucket, for review only (§12, §41). `imageUrl` stays
  // null so it can never reach `recipes.source_image_url` and be shown.
  raw.imageUrl = null;
  raw.payload = { magazine: recipe, provenance: source };

  return raw;
}

export function toCanonicalRecipe(
  recipe: MagazineRecipe,
  source: MagazineProvenance,
  options: { importedAt: string; servings?: number },
): CanonicalRecipe {
  return normalizeRecipe(toRawRecipe(recipe, source), {
    importedAt: options.importedAt,
    ...(options.servings === undefined ? {} : { servings: options.servings }),
  });
}
