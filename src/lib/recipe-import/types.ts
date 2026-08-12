/**
 * The import pipeline's vocabulary.
 *
 *   SOURCE → fetch → parse → RawRecipe → normalize → CanonicalRecipe
 *          → validate → preview → save
 *
 * Two shapes, one per side of the normalizer:
 *
 *   * `RawRecipe` is provider-shaped and deliberately loose — strings as the
 *     source wrote them, nothing inferred. It is what gets stored in
 *     `recipe_imports.raw_data`, so a parser fix can be replayed offline.
 *   * `CanonicalRecipe` is *our* shape. It mirrors the database on purpose:
 *     recipe → cooking paths → steps → dials, plus grouped ingredient lines.
 *     There is no second recipe representation in this codebase, and this file
 *     must not become one.
 *
 * Nothing here is translated. An imported recipe keeps its source language
 * until a later, explicit AI pass adapts it to pt-BR.
 */
import type { ChefMode, Difficulty, DialKind, EquipmentType, UnitKind } from '@/domain/types';

/**
 * Registered providers. Adding one is a file in `providers/`, not a migration —
 * `recipe_imports.provider` is free text precisely so this stays a code change.
 *
 * `social` is one provider for Instagram and Facebook rather than two, because
 * the parsing is identical: neither publishes a recipe, both publish a caption,
 * and what is parsed is the structured object the reading pass produced from
 * that caption. Which network it came from survives in the external id
 * (`instagram:C8xY…`), where it is data rather than a second code path.
 *
 * `magazine` is the odd one out and has no entry in `IMPORTERS`: there is no URL
 * to detect and no page to parse, because the source is a PDF read by
 * `src/lib/magazine-import`. It appears here so that a magazine recipe travels
 * through the *same* `RawRecipe → CanonicalRecipe` normalizer as every other
 * source — which is the whole point, and also what makes migration 14 apply to
 * it: `source_provider = 'magazine'` cannot be published.
 */
export type ProviderId = 'cookomix' | 'cookidoo' | 'social' | 'magazine';

/* ---------------------------------------------------------------------------
 * Raw side
 * ------------------------------------------------------------------------- */

export interface RawIngredientLine {
  /** The line exactly as the source printed it. */
  text: string;
  /** Split out when the source separates them (Cookomix's `dl.ingredients`). */
  name?: string | null;
  amountText?: string | null;
  /** Set when the source flags an alternative ("100 g Dinkelkörner"). */
  alternativeText?: string | null;
  groupName?: string | null;
}

export interface RawStepLine {
  text: string;
  /**
   * The source's own label for the step. Cookomix names every `HowToStep`
   * ("Programmation du Thermomix", "Mise au four"), which is a far better
   * appliance signal than guessing from the sentence.
   */
  label?: string | null;
  groupName?: string | null;
}

export interface RawNutrition {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

/** What a provider parser produces. Every field may be missing. */
export interface RawRecipe {
  provider: ProviderId;
  sourceUrl: string | null;
  externalId: string | null;
  language: string | null;

  title: string | null;
  description: string | null;
  imageUrl: string | null;
  authorName: string | null;

  yieldText: string | null;
  servings: number | null;
  prepTimeSeconds: number | null;
  cookTimeSeconds: number | null;
  totalTimeSeconds: number | null;

  difficultyText: string | null;
  category: string | null;
  cuisine: string | null;
  keywords: string[];
  /** "Thermomix TM31, TM5, TM6 et TM7" and friends — free text, kept verbatim. */
  deviceText: string | null;

  ingredients: RawIngredientLine[];
  steps: RawStepLine[];
  nutrition: RawNutrition;
  ratingValue: number | null;
  ratingCount: number | null;
  notes: { kind: string; title: string | null; body: string }[];

  /** Everything the parser saw. Stored verbatim; never read by the app. */
  payload: unknown;
}

export function emptyRawRecipe(provider: ProviderId): RawRecipe {
  return {
    provider,
    sourceUrl: null,
    externalId: null,
    language: null,
    title: null,
    description: null,
    imageUrl: null,
    authorName: null,
    yieldText: null,
    servings: null,
    prepTimeSeconds: null,
    cookTimeSeconds: null,
    totalTimeSeconds: null,
    difficultyText: null,
    category: null,
    cuisine: null,
    keywords: [],
    deviceText: null,
    ingredients: [],
    steps: [],
    nutrition: { kcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null },
    ratingValue: null,
    ratingCount: null,
    notes: [],
    payload: null,
  };
}

/* ---------------------------------------------------------------------------
 * Canonical side
 * ------------------------------------------------------------------------- */

/**
 * A Thermomix control panel, as data.
 *
 * `speed` and `temperatureC` are unions because the machine's own dials are:
 * "Vitesse Cuillère" and "Varoma" are positions, not numbers, and rounding them
 * to 0.5 or 120 would be an invention. Everything lands in `cooking_step_dials`
 * where `value_num` drives timers and `value_text` is what the screen prints.
 */
export interface ThermomixSettings {
  durationSeconds: number | null;
  temperatureC: number | 'varoma' | null;
  speed: number | 'spoon' | 'knead' | 'turbo' | null;
  /**
   * The speed exactly as the source printed it ("Vitesse Cuillère", "vitesse
   * mijotage"). Kept because the union above is coarser than the machine:
   * mijotage and cuillère both normalize to `spoon`, and the review screen
   * should still be able to show which one was written.
   */
  speedText: string | null;
  reverse: boolean;
  /** True when the source said "turbo" as a mode rather than as a speed. */
  turbo: boolean;
  /** Varoma used as an accessory ("Ajouter le Varoma"), not as a temperature. */
  varomaAccessory: boolean;
}

export interface CanonicalStep {
  position: number;
  /** Imperative headline for cook mode ("Cuire", "Mélanger"). */
  verb: string | null;
  instruction: string;
  equipment: EquipmentType;
  durationSeconds: number | null;
  /** Oven / air-fryer temperature. Thermomix temperature lives in `thermomix`. */
  temperatureC: number | null;
  thermomix: ThermomixSettings | null;
  /** The sentence this step was parsed from, for review and re-parsing. */
  sourceText: string;
  sourceLabel: string | null;
}

/**
 * One route through the recipe.
 *
 * An import produces exactly one path — the source's own. Multi-appliance
 * support is not a new field here: it is a second `cooking_paths` row, which
 * is how the app already models "the same dish, another kitchen".
 */
export interface CanonicalPath {
  slug: string;
  name: string;
  requiredEquipment: EquipmentType[];
  totalMinutes: number | null;
  activeMinutes: number | null;
  isRecommended: boolean;
  reason: string | null;
  steps: CanonicalStep[];
}

export interface CanonicalIngredient {
  position: number;
  groupName: string | null;
  /** Verbatim from the source. Never overwritten, never translated. */
  sourceName: string;
  sourceQuantity: string | null;
  sourceUnit: string | null;
  /**
   * The Brazilian name. Always null on import: a mechanical
   * "crème fraîche épaisse" → "creme de leite" is a destructive guess, and the
   * AI adaptation pass owns that decision.
   */
  normalizedName: string | null;
  quantity: number | null;
  unit: string | null;
  unitKind: UnitKind;
  note: string | null;
  isOptional: boolean;
  isScalable: boolean;
}

export interface CanonicalSource {
  provider: ProviderId;
  url: string | null;
  externalId: string | null;
  /** ISO instant. Passed in rather than read from the clock, so tests are stable. */
  importedAt: string;
  /** Kept as a URL for the review screen. Imported photos are never downloaded. */
  imageUrl: string | null;
  authorName: string | null;
  language: string | null;
}

export interface CanonicalRecipe {
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  language: string;
  country: string;

  servings: number;
  prepTimeSeconds: number | null;
  cookTimeSeconds: number | null;
  totalTimeSeconds: number;
  difficulty: Difficulty;

  cuisine: string | null;
  category: string | null;
  tags: string[];

  ingredients: CanonicalIngredient[];
  paths: CanonicalPath[];
  notes: { kind: string; title: string | null; body: string }[];

  /** Per serving, attached to the `normal` chef mode on save. */
  nutrition: RawNutrition;
  nutritionMode: ChefMode;

  source: CanonicalSource;
  /** sha256(provider + normalized title + ingredient names). Set by `fingerprint`. */
  fingerprint: string;
}

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

export interface ValidationIssue {
  /** Machine-readable, so the UI can group without parsing prose. */
  code: string;
  message: string;
  /** "steps[6]", "ingredients[2]" — where to look. */
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/* ---------------------------------------------------------------------------
 * The importer contract
 * ------------------------------------------------------------------------- */

/**
 * What a provider is handed. `document` is a parsed DOM — produced by jsdom in
 * the CLI and by `DOMParser` in the browser, so no provider ever imports either.
 */
export interface ParseInput {
  url: string | null;
  html?: string | null;
  document?: Document | null;
  /** Mode 3: a JSON payload the user exported or a browser extension posted. */
  structuredData?: unknown;
}

export interface FetchResult {
  url: string;
  html: string;
  status: number;
}

/**
 * Adding a provider means implementing this and registering it. The pipeline
 * (`runImport`) is shared, which is the whole point: TudoGostoso should be one
 * file, not a second scraper.
 */
export interface RecipeImporter {
  readonly id: ProviderId;
  readonly label: string;
  /** Hosts this importer answers for, used by `detectProvider`. */
  readonly hosts: readonly string[];

  canHandle(url: string): boolean;
  /** Extracts the provider's id from a URL, when the URL carries one. */
  externalIdFromUrl(url: string): string | null;
  parse(input: ParseInput): Promise<RawRecipe>;
  /** Per-provider quirks on top of the shared normalizer. */
  normalize(raw: RawRecipe, options: NormalizeOptions): CanonicalRecipe;
}

export interface NormalizeOptions {
  /** ISO instant stamped onto the source. Injected so imports are reproducible. */
  importedAt: string;
  /** Overrides the source's serving count when the cook asks for another. */
  servings?: number;
}

/** Dial rows for one step, in the shape `cooking_step_dials` expects. */
export interface StepDialInput {
  kind: DialKind;
  valueNum: number | null;
  valueText: string | null;
  subLabel: string | null;
  position: number;
}
