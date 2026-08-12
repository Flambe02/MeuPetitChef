/**
 * Validation, in two tiers.
 *
 *   errors   — the recipe cannot be saved. Either it would violate a database
 *              constraint, or it is not a recipe (no title, no ingredients, no
 *              steps).
 *   warnings — the recipe is saveable but a human should look. Missing
 *              nutrition, a quantity that failed to parse, a Varoma step whose
 *              temperature did not come through.
 *
 * Warnings never block: an import that stops on "nutrition missing" would stop
 * on most of the internet.
 *
 * Messages are pt-BR because they are shown to the person reviewing the import.
 */
import type { EquipmentType } from '@/domain/types';

import type { CanonicalRecipe, ValidationIssue, ValidationResult } from './types.ts';
import { looksLikeProgram } from './thermomix.ts';
import { CANONICAL_UNITS } from './units.ts';

/** Mirrors the `temperature_c between 0 and 350` check on the step tables. */
const MAX_TEMPERATURE_C = 350;
const MAX_SPEED = 10;
/** A recipe longer than a day is a parse error, not a braise. */
const MAX_TOTAL_SECONDS = 86_400;

export function validateRecipe(recipe: CanonicalRecipe): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  /* ── Identity ─────────────────────────────────────────────────────────── */
  if (!recipe.title.trim()) {
    errors.push({ code: 'title_missing', message: 'A receita não tem título.' });
  }
  if (recipe.ingredients.length === 0) {
    errors.push({ code: 'no_ingredients', message: 'Nenhum ingrediente foi encontrado.' });
  }

  const steps = recipe.paths.flatMap((path) => path.steps);
  if (steps.length === 0) {
    errors.push({
      code: 'no_steps',
      message: 'Nenhum passo de preparo foi encontrado.',
    });
  }

  if (recipe.paths.length === 0) {
    errors.push({ code: 'no_path', message: 'A receita não tem nenhum modo de preparo.' });
  }

  /* ── Ingredients ──────────────────────────────────────────────────────── */
  recipe.ingredients.forEach((ingredient, index) => {
    const path = `ingredients[${index}]`;
    if (ingredient.quantity !== null && ingredient.quantity < 0) {
      errors.push({
        code: 'negative_quantity',
        message: `Quantidade negativa em "${ingredient.sourceName}".`,
        path,
      });
    }
    if (
      ingredient.quantity === null &&
      ingredient.unitKind !== 'to_taste' &&
      ingredient.unitKind !== 'pinch'
    ) {
      warnings.push({
        code: 'quantity_missing',
        message: `"${ingredient.sourceName}" ficou sem quantidade.`,
        path,
      });
    }
    if (ingredient.unit && !CANONICAL_UNITS.has(ingredient.unit)) {
      // The unit survived verbatim, meaning the table did not recognise it.
      warnings.push({
        code: 'unit_unmapped',
        message: `Unidade "${ingredient.sourceUnit}" não foi convertida (mantida como está).`,
        path,
      });
    }
  });

  /* ── Steps ────────────────────────────────────────────────────────────── */
  for (const cookingPath of recipe.paths) {
    const positions = new Set<number>();
    for (const step of cookingPath.steps) {
      const path = `${cookingPath.slug}.steps[${step.position}]`;

      if (positions.has(step.position)) {
        errors.push({
          code: 'duplicate_position',
          message: `Dois passos ocupam a posição ${step.position}.`,
          path,
        });
      }
      positions.add(step.position);

      if (!step.instruction.trim()) {
        errors.push({ code: 'empty_step', message: 'Passo sem instrução.', path });
      }
      if (step.durationSeconds !== null && step.durationSeconds < 0) {
        errors.push({ code: 'negative_duration', message: 'Duração negativa.', path });
      }
      if (
        step.temperatureC !== null &&
        (step.temperatureC < 0 || step.temperatureC > MAX_TEMPERATURE_C)
      ) {
        errors.push({
          code: 'temperature_out_of_range',
          message: `Temperatura fora da faixa: ${step.temperatureC} °C.`,
          path,
        });
      }

      const thermomix = step.thermomix;
      if (thermomix) {
        if (typeof thermomix.speed === 'number') {
          if (thermomix.speed < 0 || thermomix.speed > MAX_SPEED) {
            errors.push({
              code: 'speed_out_of_range',
              message: `Velocidade Thermomix inválida: ${thermomix.speed}.`,
              path,
            });
          }
        }
        if (
          typeof thermomix.temperatureC === 'number' &&
          (thermomix.temperatureC < 0 || thermomix.temperatureC > MAX_TEMPERATURE_C)
        ) {
          errors.push({
            code: 'temperature_out_of_range',
            message: `Temperatura Thermomix fora da faixa: ${thermomix.temperatureC} °C.`,
            path,
          });
        }
      }

      // The signature failure of a Thermomix parser: the machine words are in
      // the sentence but no dial came out of it.
      if (looksLikeProgram(step.instruction) && !thermomix) {
        warnings.push({
          code: 'thermomix_not_parsed',
          message: `O passo ${step.position + 1} parece um programa do Thermomix, mas nenhum parâmetro foi extraído.`,
          path,
        });
      }
      if (thermomix?.temperatureC === 'varoma' && thermomix.durationSeconds === null) {
        warnings.push({
          code: 'varoma_without_time',
          message: `O passo ${step.position + 1} usa Varoma sem tempo.`,
          path,
        });
      }
      if (step.equipment === 'oven' && step.temperatureC === null) {
        warnings.push({
          code: 'oven_without_temperature',
          message: `O passo ${step.position + 1} vai ao forno sem temperatura.`,
          path,
        });
      }
    }
  }

  /* ── Recipe-level ─────────────────────────────────────────────────────── */
  if (recipe.servings < 1 || recipe.servings > 30) {
    errors.push({
      code: 'servings_out_of_range',
      message: `Número de porções inválido: ${recipe.servings}.`,
    });
  }
  if (recipe.totalTimeSeconds <= 0) {
    warnings.push({ code: 'time_missing', message: 'A receita não declara tempo de preparo.' });
  }
  if (recipe.totalTimeSeconds > MAX_TOTAL_SECONDS) {
    warnings.push({
      code: 'time_implausible',
      message: 'O tempo total passa de 24 h — provável erro de leitura.',
    });
  }
  if (recipe.nutrition.kcal === null) {
    warnings.push({ code: 'nutrition_missing', message: 'Sem informação nutricional.' });
  }
  if (!recipe.source.externalId) {
    warnings.push({
      code: 'external_id_missing',
      message: 'A fonte não expôs um identificador — a deduplicação usará só a impressão digital.',
    });
  }
  if (!recipe.source.imageUrl) {
    warnings.push({ code: 'image_missing', message: 'Sem foto de origem para a revisão.' });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Counts for the CLI banner and the review screen. */
export interface ImportSummary {
  ingredients: number;
  steps: number;
  thermomixSteps: number;
  /**
   * Steps that are a Thermomix *program*. The denominator of the "parameters
   * detected" ratio: measuring it against every Thermomix step would report a
   * perfect parse as 1/9, because eight of those nine steps are "add this to
   * the bowl" and have no dials to find.
   */
  programSteps: number;
  stepsWithParameters: number;
  equipment: EquipmentType[];
}

export function summarize(recipe: CanonicalRecipe): ImportSummary {
  const steps = recipe.paths.flatMap((path) => path.steps);
  return {
    ingredients: recipe.ingredients.length,
    steps: steps.length,
    thermomixSteps: steps.filter((step) => step.equipment === 'thermomix').length,
    programSteps: steps.filter(
      (step) => step.thermomix !== null || looksLikeProgram(step.instruction),
    ).length,
    stepsWithParameters: steps.filter((step) => step.thermomix !== null).length,
    equipment: [...new Set(recipe.paths.flatMap((path) => path.requiredEquipment))],
  };
}
