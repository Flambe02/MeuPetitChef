/**
 * The provider registry and the shared pipeline.
 *
 *   SOURCE → fetch → parse → RAW → normalize → validate → preview → save
 *
 * Everything except `parse` is provider-agnostic, which is the point of the
 * whole exercise: adding TudoGostoso or Marmiton means writing one file in
 * `providers/` and adding it to `IMPORTERS` below. Nothing else changes.
 */
import type {
  CanonicalRecipe,
  ParseInput,
  ProviderId,
  RawRecipe,
  RecipeImporter,
  ValidationResult,
} from './types.ts';
import { summarize, validateRecipe, type ImportSummary } from './validate.ts';
import { cookidooImporter } from './providers/cookidoo.ts';
import { cookomixImporter } from './providers/cookomix.ts';
import { socialImporter } from './providers/social.ts';

export const IMPORTERS: readonly RecipeImporter[] = [
  cookomixImporter,
  cookidooImporter,
  socialImporter,
];

export function getImporter(id: ProviderId): RecipeImporter {
  const importer = IMPORTERS.find((candidate) => candidate.id === id);
  if (!importer) throw new Error(`Provedor desconhecido: ${id}`);
  return importer;
}

/** Which provider owns a URL, or null when none does. */
export function detectProvider(url: string): RecipeImporter | null {
  return IMPORTERS.find((importer) => importer.canHandle(url)) ?? null;
}

export function providerIds(): ProviderId[] {
  return IMPORTERS.map((importer) => importer.id);
}

/* ---------------------------------------------------------------------------
 * Pipeline
 * ------------------------------------------------------------------------- */

export interface RunImportInput {
  /** Forced provider. Omit to detect from the URL. */
  provider?: ProviderId;
  url?: string | null;
  /** Page source. Required unless `structuredData` carries the whole recipe. */
  html?: string | null;
  /** Mode 3 / browser-assisted: a JSON payload instead of (or beside) HTML. */
  structuredData?: unknown;
  /**
   * HTML → DOM. Injected because the two runtimes disagree: the browser has
   * `DOMParser`, Node needs jsdom, and the core must not import either.
   */
  parseHtml?: (html: string) => Document;
  /** Stamped onto the recipe's source. Injected so imports are reproducible. */
  importedAt?: string;
  servings?: number;
}

export interface ImportOutcome {
  provider: ProviderId;
  raw: RawRecipe;
  recipe: CanonicalRecipe;
  validation: ValidationResult;
  summary: ImportSummary;
}

/**
 * Runs a source through the whole pipeline, short of saving.
 *
 * Saving is deliberately not part of this: the brief's default is preview, and
 * a function that both parses and writes has no way to offer one without the
 * other.
 */
export async function runImport(input: RunImportInput): Promise<ImportOutcome> {
  const importer = resolveImporter(input);

  const document = input.html && input.parseHtml ? input.parseHtml(input.html) : undefined;

  const parseInput: ParseInput = {
    url: input.url ?? null,
    html: input.html ?? null,
    document: document ?? null,
    structuredData: input.structuredData,
  };

  const raw = await importer.parse(parseInput);
  const recipe = importer.normalize(raw, {
    importedAt: input.importedAt ?? new Date().toISOString(),
    ...(input.servings === undefined ? {} : { servings: input.servings }),
  });

  return {
    provider: importer.id,
    raw,
    recipe,
    validation: validateRecipe(recipe),
    summary: summarize(recipe),
  };
}

function resolveImporter(input: RunImportInput): RecipeImporter {
  if (input.provider) return getImporter(input.provider);
  if (input.url) {
    const detected = detectProvider(input.url);
    if (detected) return detected;
    throw new Error(
      `Nenhum provedor reconhece esta URL: ${input.url}. Use --provider para forçar um.`,
    );
  }
  throw new Error('Informe uma URL ou um provedor (--provider).');
}
