/**
 * The magazine importer's vocabulary.
 *
 *   PDF → pages → classify → (index) → extract → assemble → score
 *       → MagazineRecipe → RawRecipe → CanonicalRecipe → recipes
 *
 * The last two arrows matter more than the rest: a magazine recipe does **not**
 * get its own path into the database. It becomes a `RawRecipe`, which the
 * existing normalizer turns into the same `CanonicalRecipe` that Cookomix and
 * Cookidoo produce — so quantities, units, durations, oven temperatures and
 * Thermomix dials are parsed by code that is already written and already tested.
 * There is exactly one recipe representation in this codebase, and this folder
 * must not become a second one.
 *
 * Nothing here translates anything. A recipe read out of Régal stays in French
 * until the explicit adaptation pass runs, exactly as an imported Cookomix
 * recipe does (see `docs/recipe-importers.md`, §2).
 */
import type { MagazinePageKind } from '@/domain/types';

export type { MagazinePageKind };

/* ---------------------------------------------------------------------------
 * The file
 * ------------------------------------------------------------------------- */

/**
 * One page as the PDF hands it over.
 *
 * `index` is the position in the file (1-based); `folio` is the number *printed*
 * on the page. They are rarely equal — covers, inside covers and full-bleed ads
 * are usually unnumbered — and confusing them is the classic way to extract page
 * 53's advert while the recipe on the real page 53 is never read.
 */
export interface MagazinePage {
  index: number;
  folio: number | null;
  /** The embedded text layer, squished. Empty on a scanned or fully-set page. */
  text: string;
  /** True when the page carries a large raster image (usually a photo or ad). */
  hasLargeImage: boolean;
}

/** Identity read off the cover, and then corrected by a human. */
export interface MagazineIdentity {
  publication: string | null;
  issue: string | null;
  /** `YYYY` or `YYYY-MM`. A magazine issue is a month, not a day. */
  publicationDate: string | null;
  language: string;
  country: string | null;
  pageCount: number | null;
}

/* ---------------------------------------------------------------------------
 * Classification
 * ------------------------------------------------------------------------- */

export interface PageVerdict {
  kind: MagazinePageKind;
  confidence: number;
  /** How it was decided. `text` costs nothing; `vision` costs a model call. */
  by: 'text' | 'vision' | 'index' | 'manual';
  /** Plain-language evidence, shown in the log drawer. */
  reasons: string[];
  /** Titles the classifier believes are on this page, when it can see any. */
  recipeTitles: string[];
}

/** One line of the magazine's own recipe index: "Gaspacho ............ 53". */
export interface RecipeIndexEntry {
  title: string;
  /** As printed in the index — a folio, not a file position. */
  folio: number;
}

/* ---------------------------------------------------------------------------
 * The recipe, as the magazine wrote it
 * ------------------------------------------------------------------------- */

export interface MagazineIngredient {
  quantity: number | null;
  unit: string | null;
  ingredient: string;
  /** "finement émincée", "à température ambiante" — kept apart from the name. */
  preparation: string | null;
  optional: boolean;
}

export interface MagazineStep {
  order: number;
  instruction: string;
}

/**
 * What one extraction produces. Every field is nullable because a magazine page
 * genuinely omits things, and a `null` that says "not printed" is worth far more
 * than a plausible number nobody can trace.
 */
export interface MagazineRecipe {
  title: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  ingredients: MagazineIngredient[];
  steps: MagazineStep[];
  tips: string[];
  notes: string[];
  /** ISO 639-1 as the page reads, not as we would like it to read. */
  language: string | null;
  /** The recipe started on an earlier page. */
  continuationBefore: boolean;
  /** The recipe carries on onto the next page. */
  continuationAfter: boolean;
  /** The model's own reading of how sure it is. Never trusted on its own. */
  reportedConfidence: ConfidenceScore;
}

export interface ConfidenceScore {
  overall: number;
  title: number;
  ingredients: number;
  steps: number;
}

/**
 * A recipe once it has been stitched together across pages and scored.
 * This is what becomes one `magazine_import_items` row.
 */
export interface AssembledRecipe {
  recipe: MagazineRecipe;
  /** File positions, in reading order. Two entries means a spread. */
  pages: number[];
  /** Which recipe on the page this was, when several share one. */
  blockIndex: number;
  confidence: ConfidenceScore;
  verdict: RecipeVerdict;
  /** Why the score landed where it did — the reviewer's shortcut. */
  findings: string[];
  /** Set when the magazine's own index announced this title. */
  indexedTitle: string | null;
}

export type RecipeVerdict = 'ready' | 'review' | 'problem';

export interface ConfidenceThresholds {
  /** At or above: ready. */
  ready: number;
  /** At or above (and below `ready`): needs a look. Below: problem. */
  review: number;
}

/* ---------------------------------------------------------------------------
 * The provider
 *
 * §34 of the brief, and the reason it is worth the indirection: the model that
 * reads a magazine page well today is not the one that will read it best in six
 * months. Everything above this line is provider-agnostic; swapping OpenAI for
 * Anthropic or Gemini is one file in `providers/`.
 * ------------------------------------------------------------------------- */

/** What one model call cost. Returned beside every result, never inferred later. */
export interface AiUsage {
  provider: string;
  model: string;
  operation: 'classify_page' | 'read_index' | 'extract_recipe';
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface ProviderResult<T> {
  data: T;
  usage: AiUsage;
}

/** A page handed to the model: the rendered image, plus whatever text it had. */
export interface VisionPage {
  index: number;
  folio: number | null;
  /** `data:image/jpeg;base64,…`, already downscaled by the caller. */
  imageDataUrl: string;
  text: string;
}

export interface MagazineVisionProvider {
  readonly id: string;
  readonly model: string;

  /** Is this page a recipe, an advert, an index…? One page, one answer. */
  analyzePage(page: VisionPage): Promise<ProviderResult<PageVerdict>>;

  /** Reads a table of contents into title/page pairs. */
  readIndex(pages: VisionPage[]): Promise<ProviderResult<RecipeIndexEntry[]>>;

  /**
   * Reads every recipe on the given pages. Several pages are passed together
   * when a recipe runs across a spread; the model is told which is which.
   */
  extractRecipes(pages: VisionPage[]): Promise<ProviderResult<MagazineRecipe[]>>;
}
