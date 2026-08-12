/**
 * Adaptation — the pass that turns an imported recipe into a Brazilian one.
 *
 * Import and adaptation are deliberately two separate steps (see
 * `docs/recipe-importers.md`, §25 of the brief): the import keeps the source
 * faithfully, and this rewrites it. Keeping them apart is what makes the
 * rewrite reviewable and reversible — the French original stays in
 * `recipe_imports.raw_data`, and every rewrite lands in `adaptation_logs`.
 *
 * What the model is allowed to touch:
 *
 *   title · subtitle · description · ingredient display names and notes ·
 *   step verbs and instruction text · recipe notes
 *
 * What it must never touch, and what this file *verifies* it did not:
 *
 *   durations · temperatures · Thermomix speeds · quantities · units ·
 *   step order · the number of steps
 *
 * Those came off a machine panel. They are facts, not prose, and they live in
 * their own columns — the model never even sees a chance to change most of
 * them, and the ones embedded in the instruction text are checked afterwards.
 */
import type { ValidationIssue, ValidationResult } from './types.ts';
import { squish } from './text.ts';
import { findDuration } from './duration.ts';
import { findTemperature } from './temperature.ts';
import { looksLikeProgram, parseThermomix } from './thermomix.ts';

/* ---------------------------------------------------------------------------
 * The contract with the Edge Function
 *
 * Mirrored in `supabase/functions/adapt-recipe/index.ts`, which enforces it as
 * a JSON schema. Same arrangement as `generate-recipe`: one contract written
 * twice, because the function is Deno and cannot import this file.
 * ------------------------------------------------------------------------- */

export interface AdaptationIngredient {
  id: string;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
}

export interface AdaptationStep {
  id: string;
  verb: string | null;
  instruction: string;
}

export interface AdaptationNote {
  id: string;
  title: string | null;
  body: string;
}

export interface AdaptationRequest {
  recipeId: string;
  sourceLanguage: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  servings: number;
  ingredients: AdaptationIngredient[];
  steps: AdaptationStep[];
  notes: AdaptationNote[];
}

export interface AdaptedIngredient {
  id: string;
  displayName: string;
  note: string | null;
  /** Filled when a French product was swapped for a Brazilian equivalent. */
  substitution: string | null;
}

export interface AdaptedStep {
  id: string;
  verb: string;
  instruction: string;
}

export interface AdaptationResult {
  title: string;
  subtitle: string | null;
  description: string | null;
  ingredients: AdaptedIngredient[];
  steps: AdaptedStep[];
  notes: AdaptationNote[];
}

/* ---------------------------------------------------------------------------
 * Sanitising
 * ------------------------------------------------------------------------- */

/**
 * Words a model writes when it means "nothing".
 *
 * A schema that declares `["string", "null"]` does not stop a model from
 * answering with the four characters `null`, and that string then travels all
 * the way into the database as a note reading "null" on every ingredient. Seen
 * on the very first real run, on all six lines at once.
 */
const EMPTY_WORDS = new Set(['null', 'none', 'nenhum', 'nenhuma', 'n/a', 'na', 'undefined', '-']);

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = squish(value);
  return text && !EMPTY_WORDS.has(text.toLowerCase()) ? text : null;
}

/**
 * Normalizes a model answer before anything else looks at it.
 *
 * Called at the boundary by every caller, so neither the verification nor the
 * write has to know that "null" is sometimes a string.
 */
export function sanitizeAdaptation(result: AdaptationResult): AdaptationResult {
  return {
    title: squish(result.title),
    subtitle: emptyToNull(result.subtitle),
    description: emptyToNull(result.description),
    ingredients: result.ingredients.map((item) => ({
      id: item.id,
      displayName: squish(item.displayName),
      note: emptyToNull(item.note),
      substitution: emptyToNull(item.substitution),
    })),
    steps: result.steps.map((step) => ({
      id: step.id,
      verb: squish(step.verb ?? ''),
      instruction: squish(step.instruction),
    })),
    notes: result.notes.map((note) => ({
      id: note.id,
      title: emptyToNull(note.title),
      body: squish(note.body),
    })),
  };
}

/* ---------------------------------------------------------------------------
 * Verification
 * ------------------------------------------------------------------------- */

interface MachineFacts {
  durationSeconds: number | null;
  temperature: number | 'varoma' | null;
  speed: number | string | null;
}

/**
 * The machine numbers a sentence carries.
 *
 * Read with the same parsers the import uses, so "Cuire 20 min/100°C/Vitesse
 * Cuillère" and "Cozinhe 20 min/100°C/vel. colher" produce the *same* facts
 * even though every word changed. That is the whole trick: it lets us check a
 * translation without comparing translations.
 */
export function machineFacts(instruction: string): MachineFacts {
  // `parseThermomix` reads slash-separated *segments* of a control-panel
  // program. Handed a whole sentence it misreads it — "…pendant 25 min à
  // 210°C" comes back as 25 °C with no duration, because the first number wins
  // the temperature slot. So it is only used on sentences that really are
  // programs; everything else goes through the sentence-level readers, which
  // require a degree marker before believing in a temperature.
  const thermomix = looksLikeProgram(instruction) ? parseThermomix(instruction) : null;
  if (thermomix) {
    return {
      durationSeconds: thermomix.durationSeconds,
      temperature: thermomix.temperatureC,
      speed: thermomix.speed,
    };
  }
  return {
    durationSeconds: findDuration(instruction),
    temperature: findTemperature(instruction),
    speed: null,
  };
}

function same(a: unknown, b: unknown): boolean {
  return a === b || (a === null && b === undefined) || (a === undefined && b === null);
}

/**
 * Checks that the rewrite kept the recipe's facts.
 *
 * Errors block the write. This is not defensive programming for its own sake:
 * a model that quietly turns "20 min" into "2 min" produces a recipe that
 * looks perfectly plausible on screen and burns dinner, and no reviewer reads
 * eighteen steps closely enough to catch it.
 */
export function verifyAdaptation(
  request: AdaptationRequest,
  result: AdaptationResult,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  /* ── Structure ────────────────────────────────────────────────────────── */
  if (!squish(result.title)) {
    errors.push({ code: 'title_missing', message: 'A adaptação não devolveu título.' });
  }

  const stepById = new Map(result.steps.map((step) => [step.id, step]));
  if (result.steps.length !== request.steps.length) {
    errors.push({
      code: 'step_count_changed',
      message: `A adaptação devolveu ${result.steps.length} passos em vez de ${request.steps.length}.`,
    });
  }

  const ingredientById = new Map(result.ingredients.map((item) => [item.id, item]));
  if (result.ingredients.length !== request.ingredients.length) {
    errors.push({
      code: 'ingredient_count_changed',
      message: `A adaptação devolveu ${result.ingredients.length} ingredientes em vez de ${request.ingredients.length}.`,
    });
  }

  /* ── The facts ────────────────────────────────────────────────────────── */
  for (const original of request.steps) {
    const adapted = stepById.get(original.id);
    if (!adapted) {
      errors.push({
        code: 'step_missing',
        message: 'Um passo desapareceu na adaptação.',
        path: `steps[${original.id}]`,
      });
      continue;
    }

    if (!squish(adapted.instruction)) {
      errors.push({
        code: 'empty_step',
        message: 'Um passo voltou vazio.',
        path: `steps[${original.id}]`,
      });
      continue;
    }

    const before = machineFacts(original.instruction);
    const after = machineFacts(adapted.instruction);

    if (!same(before.durationSeconds, after.durationSeconds)) {
      errors.push({
        code: 'duration_changed',
        message: `O tempo mudou na adaptação: ${String(before.durationSeconds)} s → ${String(after.durationSeconds)} s.`,
        path: `steps[${original.id}]`,
      });
    }
    if (!same(before.temperature, after.temperature)) {
      errors.push({
        code: 'temperature_changed',
        message: `A temperatura mudou na adaptação: ${String(before.temperature)} → ${String(after.temperature)}.`,
        path: `steps[${original.id}]`,
      });
    }
    if (!same(before.speed, after.speed)) {
      errors.push({
        code: 'speed_changed',
        message: `A velocidade mudou na adaptação: ${String(before.speed)} → ${String(after.speed)}.`,
        path: `steps[${original.id}]`,
      });
    }

    if (!squish(adapted.verb)) {
      warnings.push({
        code: 'verb_missing',
        message: 'Um passo ficou sem verbo — o modo cozinha mostra o verbo em destaque.',
        path: `steps[${original.id}]`,
      });
    }
  }

  /* ── Ingredients ──────────────────────────────────────────────────────── */
  for (const original of request.ingredients) {
    const adapted = ingredientById.get(original.id);
    if (!adapted) {
      errors.push({
        code: 'ingredient_missing',
        message: `"${original.displayName}" desapareceu na adaptação.`,
        path: `ingredients[${original.id}]`,
      });
      continue;
    }
    if (!squish(adapted.displayName)) {
      errors.push({
        code: 'ingredient_empty',
        message: 'Um ingrediente voltou sem nome.',
        path: `ingredients[${original.id}]`,
      });
    }
    if (adapted.substitution) {
      // Not a problem — a substitution is the point — but a human should see
      // which products were swapped before the recipe is published.
      warnings.push({
        code: 'ingredient_substituted',
        message: `"${original.displayName}" → "${adapted.displayName}": ${adapted.substitution}`,
        path: `ingredients[${original.id}]`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ---------------------------------------------------------------------------
 * Retry
 * ------------------------------------------------------------------------- */

export interface AdaptationCall {
  (request: AdaptationRequest): Promise<{ adapted: AdaptationResult; model?: string }>;
}

export interface AdaptationAttempt {
  result: AdaptationResult;
  validation: ValidationResult;
  model: string | undefined;
  attempts: number;
}

/**
 * Asks for the rewrite until it passes verification.
 *
 * Sampling is not deterministic, and the failures seen on real recipes are
 * accidents rather than convictions — on a first catalogue run the model
 * silently dropped the "Eau" line from a risotto, then returned it correctly
 * when asked again. Refusing outright would mean losing one recipe in three
 * over a coin flip; retrying costs one more call.
 *
 * What it does *not* do is lower the bar: a rewrite that never verifies is
 * still refused, and nothing is written.
 */
export async function adaptWithRetry(
  request: AdaptationRequest,
  call: AdaptationCall,
  attempts = 3,
): Promise<AdaptationAttempt> {
  let last: ValidationResult | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { adapted, model } = await call(request);
    const result = sanitizeAdaptation(adapted);
    const validation = verifyAdaptation(request, result);
    if (validation.ok) return { result, validation, model, attempts: attempt };
    last = validation;
  }

  throw new Error(
    `A adaptação falhou em ${attempts} tentativas: ` +
      (last?.errors.map((issue) => issue.message).join(' · ') ?? 'motivo desconhecido'),
  );
}

/** True when the text still looks like the source language rather than pt-BR. */
export function looksUntranslated(request: AdaptationRequest, result: AdaptationResult): boolean {
  return squish(result.title).toLowerCase() === squish(request.title).toLowerCase();
}
