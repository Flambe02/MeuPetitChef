/**
 * How sure are we, and why.
 *
 * The model reports its own confidence, and that number on its own is close to
 * worthless: a model that misread a column of ingredients is exactly as sure of
 * itself as one that read it perfectly. What it *cannot* fake is the shape of
 * what it returned — a recipe with no steps, or with eight ingredients of which
 * six have no quantity, is visibly incomplete whatever the model says about it.
 *
 * So the score is the **lower** of the two: the model's own reading, and what
 * the structure supports. Confidence can be talked down by evidence, never up.
 *
 * Every finding is a pt-BR sentence, because it is shown to the person deciding
 * whether to trust the extraction — "3 de 8 ingredientes sem quantidade" tells
 * them where to look, and "0.72" does not.
 */
import type {
  ConfidenceScore,
  ConfidenceThresholds,
  MagazineRecipe,
  RecipeVerdict,
} from './types.ts';

/** §21's bands. Configurable per import; these are the defaults. */
export const DEFAULT_THRESHOLDS: ConfidenceThresholds = { ready: 0.9, review: 0.7 };

/** A step shorter than this is a caption or a stray line, not an instruction. */
const MIN_STEP_LENGTH = 15;

export function verdictFor(overall: number, thresholds: ConfidenceThresholds): RecipeVerdict {
  if (overall >= thresholds.ready) return 'ready';
  if (overall >= thresholds.review) return 'review';
  return 'problem';
}

export interface ScoredRecipe {
  confidence: ConfidenceScore;
  verdict: RecipeVerdict;
  findings: string[];
}

/**
 * Scores one assembled recipe.
 *
 * `pageSpan` is passed in because a recipe stitched from two pages has one more
 * way to be wrong than a recipe that fitted on one, and a dangling
 * "continues overleaf" that never found its other half is the failure this is
 * most likely to catch.
 */
export function scoreRecipe(
  recipe: MagazineRecipe,
  options: {
    thresholds?: ConfidenceThresholds;
    /** True when the recipe still claims a continuation nothing satisfied. */
    danglingContinuation?: boolean;
    /** True when the magazine's own index announced this title. */
    indexed?: boolean;
  } = {},
): ScoredRecipe {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const findings: string[] = [];

  /* ── Title ────────────────────────────────────────────────────────────── */
  const title = recipe.title.trim();
  let titleScore = 1;
  if (title.length < 3) {
    titleScore = 0;
    findings.push('Sem título legível.');
  } else if (title.length < 6) {
    titleScore = 0.6;
    findings.push('Título muito curto — confira se não ficou cortado.');
  }
  // The index is an independent witness: the magazine itself said this dish is
  // on this page. That is worth more than any amount of self-reported certainty.
  if (options.indexed) titleScore = Math.max(titleScore, 0.95);

  /* ── Ingredients ──────────────────────────────────────────────────────── */
  let ingredientScore: number;
  const total = recipe.ingredients.length;
  if (total === 0) {
    ingredientScore = 0;
    findings.push('Nenhum ingrediente foi lido.');
  } else if (total < 2) {
    ingredientScore = 0.3;
    findings.push('Só um ingrediente — a lista provavelmente ficou incompleta.');
  } else {
    const withQuantity = recipe.ingredients.filter(
      (line) => line.quantity !== null && line.quantity > 0,
    ).length;
    const missing = total - withQuantity;
    ingredientScore = 0.6 + 0.4 * (withQuantity / total);
    if (missing > 0) {
      // Not always a fault: "sal a gosto" has no quantity by design. It is
      // still the thing a reviewer should glance at first.
      findings.push(`${missing} de ${total} ingredientes sem quantidade.`);
    }
  }

  /* ── Steps ────────────────────────────────────────────────────────────── */
  let stepScore: number;
  const steps = recipe.steps.filter((step) => step.instruction.trim().length >= MIN_STEP_LENGTH);
  if (steps.length === 0) {
    stepScore = 0;
    findings.push('Nenhum passo de preparo foi lido.');
  } else if (steps.length === 1) {
    stepScore = 0.5;
    findings.push('Um único passo — o preparo pode ter sido cortado.');
  } else {
    stepScore = Math.min(1, 0.6 + 0.1 * steps.length);
    const dropped = recipe.steps.length - steps.length;
    if (dropped > 0) findings.push(`${dropped} linha(s) curta(s) demais para serem passos.`);
  }

  /* ── The whole ────────────────────────────────────────────────────────── */
  if (recipe.servings === null) findings.push('Sem número de porções.');
  if (recipe.prepMinutes === null && recipe.cookMinutes === null) {
    findings.push('Sem tempos de preparo ou cozimento.');
  }

  const structural = 0.2 * titleScore + 0.4 * ingredientScore + 0.4 * stepScore;
  let overall = Math.min(structural, clamp(recipe.reportedConfidence.overall || structural));

  if (options.danglingContinuation) {
    // The model said the recipe carries on and no continuation was found. That
    // is a half-recipe however good the half is, and it must never read "ready".
    overall = Math.min(overall, thresholds.review - 0.01);
    findings.push('A receita continua em outra página e a continuação não foi encontrada.');
  }

  const confidence: ConfidenceScore = {
    overall: round(overall),
    title: round(Math.min(titleScore, clamp(recipe.reportedConfidence.title || titleScore))),
    ingredients: round(
      Math.min(ingredientScore, clamp(recipe.reportedConfidence.ingredients || ingredientScore)),
    ),
    steps: round(Math.min(stepScore, clamp(recipe.reportedConfidence.steps || stepScore))),
  };

  return { confidence, verdict: verdictFor(confidence.overall, thresholds), findings };
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const round = (value: number): number => Math.round(clamp(value) * 100) / 100;
