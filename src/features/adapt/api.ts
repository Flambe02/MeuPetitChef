/**
 * Repository for the Brazilian adaptation pass.
 *
 * An imported recipe is faithful to its source, which means it is in French
 * and calls for crème fraîche. This is the step that makes it ours: pt-BR
 * prose, Brazilian products, and a `search_vector` that finally matches what a
 * Brazilian cook types.
 *
 * The rewrite goes through the `adapt-recipe` Edge Function, never OpenAI
 * directly — the key lives on the server precisely so it cannot be read out of
 * this bundle.
 */
import { supabase } from '@/lib/supabase/client';
import { DataError } from '@/lib/supabase/errors';
import type { AdaptationResult, AdaptationRequest } from '@/lib/recipe-import/adapt';
import { adaptWithRetry } from '@/lib/recipe-import/adapt';
import { applyAdaptation, readForAdaptation } from '@/lib/recipe-import/adapt-persist';
import type { ValidationResult } from '@/lib/recipe-import/types';

export interface AdaptationOutcome {
  before: AdaptationRequest;
  after: AdaptationResult;
  validation: ValidationResult;
  model: string;
}

/** Asks the Edge Function for the rewrite. Does not write anything. */
export async function requestAdaptation(
  request: AdaptationRequest,
): Promise<{ adapted: AdaptationResult; model: string }> {
  const { data, error } = (await supabase.functions.invoke('adapt-recipe', {
    body: { recipe: request },
  })) as {
    data: { adapted?: AdaptationResult; model?: string; error?: string } | null;
    error: unknown;
  };

  if (error) {
    const detail = await readFunctionError(error);
    throw new DataError(detail ?? 'Não foi possível adaptar a receita agora.', { cause: error });
  }
  if (data?.error) throw new DataError(data.error);
  if (!data?.adapted) throw new DataError('Resposta vazia da adaptação.');

  return { adapted: data.adapted, model: data.model ?? 'desconhecido' };
}

async function readFunctionError(error: unknown): Promise<string | null> {
  const response = (error as { context?: Response }).context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads the draft, asks for the rewrite, checks it, and writes it back.
 *
 * The check is not a formality. The model is told never to touch a duration, a
 * temperature or a Thermomix speed, and `verifyAdaptation` re-reads those
 * numbers out of the rewritten sentences with the same parsers the import
 * uses. If any of them moved, nothing is written — a recipe that reads
 * beautifully and cooks for two minutes instead of twenty is worse than no
 * recipe at all.
 */
export async function adaptRecipe(
  recipeId: string,
  userId: string | null,
): Promise<AdaptationOutcome> {
  const source = await readForAdaptation(supabase, recipeId);

  // Sanitises the answer, verifies the numbers, and asks again when it does not
  // hold up — the observed failures are sampling accidents, not convictions.
  const { result, validation, model } = await adaptWithRetry(source.request, requestAdaptation);

  await applyAdaptation(supabase, {
    source,
    result,
    validation,
    userId,
    model: model ?? 'desconhecido',
  });

  return { before: source.request, after: result, validation, model: model ?? 'desconhecido' };
}
