/**
 * Reading a draft for adaptation, and writing the rewrite back.
 *
 * Like `persist.ts`, this takes the Supabase client as an argument so the same
 * code serves the browser (user session) and the batch CLI (service role).
 *
 * The rewrite is applied in place, on the draft. That is safe because the
 * original is never lost: `recipe_imports.raw_data` holds the source payload,
 * `recipe_imports.extracted` holds the faithful normalized version, and every
 * adaptation writes an `adaptation_logs` row carrying both halves. The concept
 * document asks for adaptations to be traceable and reversible; this is that.
 */
import type { EquipmentType } from '@/domain/types';
import type { Json } from '@/lib/supabase/database.types';

import type { AdaptationRequest, AdaptationResult } from './adapt.ts';
import type { ValidationResult } from './types.ts';
import type { ImportSupabaseClient } from './persist.ts';

/** Everything needed to write the rewrite back, beside the wire contract. */
export interface AdaptationSource {
  request: AdaptationRequest;
  /**
   * Columns the upserts need but the model never sees. `equipment` also feeds
   * `extractFacts`, which needs to know which appliance each timing belonged to.
   */
  stepRows: {
    id: string;
    path_id: string;
    position: number;
    is_micro: boolean;
    equipment: EquipmentType;
  }[];
  ingredientRows: { id: string; recipe_id: string; position: number }[];
  noteRows: { id: string; recipe_id: string; kind: string; position: number }[];
}

/**
 * Loads a draft in the shape the adaptation function expects.
 *
 * Only the *prose* is sent: names, notes, instructions. Quantities, units,
 * durations and dials stay in their columns and are never exposed to the
 * model, which is the cheapest possible way to guarantee it cannot change them.
 */
export async function readForAdaptation(
  client: ImportSupabaseClient,
  recipeId: string,
): Promise<AdaptationSource> {
  const { data: recipe, error } = await client
    .from('recipes')
    .select(
      `id, title, subtitle, description, default_servings, source_provider,
       recipe_ingredients ( id, recipe_id, position, display_name, quantity, unit, note ),
       recipe_notes ( id, recipe_id, kind, title, body, position ),
       cooking_paths ( id, cooking_steps ( id, path_id, position, is_micro, equipment, verb, instruction ) )`,
    )
    .eq('id', recipeId)
    .single();

  if (error) throw new Error(`Receita não encontrada: ${error.message}`);

  const steps = recipe.cooking_paths
    .flatMap((path) => path.cooking_steps)
    .filter((step) => !step.is_micro)
    .sort((a, b) => a.position - b.position);

  const ingredients = [...recipe.recipe_ingredients].sort((a, b) => a.position - b.position);
  const notes = [...recipe.recipe_notes].sort((a, b) => a.position - b.position);

  return {
    request: {
      recipeId: recipe.id,
      // The provider is the best language hint we have; `recipes` stores no
      // language column, and Cookomix is French while Cookidoo is per-locale.
      sourceLanguage: recipe.source_provider === 'cookomix' ? 'fr-FR' : 'desconhecido',
      title: recipe.title,
      subtitle: recipe.subtitle,
      description: recipe.description,
      servings: recipe.default_servings,
      ingredients: ingredients.map((item) => ({
        id: item.id,
        displayName: item.display_name,
        quantity: item.quantity,
        unit: item.unit,
        note: item.note,
      })),
      steps: steps.map((step) => ({
        id: step.id,
        verb: step.verb,
        instruction: step.instruction,
      })),
      notes: notes.map((note) => ({ id: note.id, title: note.title, body: note.body })),
    },
    stepRows: steps.map((step) => ({
      id: step.id,
      path_id: step.path_id,
      position: step.position,
      is_micro: step.is_micro,
      equipment: step.equipment,
    })),
    ingredientRows: ingredients.map((item) => ({
      id: item.id,
      recipe_id: item.recipe_id,
      position: item.position,
    })),
    noteRows: notes.map((note) => ({
      id: note.id,
      recipe_id: note.recipe_id,
      kind: note.kind,
      position: note.position,
    })),
  };
}

export interface ApplyAdaptationInput {
  source: AdaptationSource;
  result: AdaptationResult;
  validation: ValidationResult;
  /** Author of the rewrite. Null for a batch run under the service role. */
  userId: string | null;
  model: string;
}

/**
 * Writes the rewrite.
 *
 * Upserts rather than one update per row: a twelve-step recipe would otherwise
 * be twenty round trips, and a catalogue-wide pass would be tens of thousands.
 * The conflict target is the primary key, so every row already exists and the
 * insert branch is never taken.
 */
export async function applyAdaptation(
  client: ImportSupabaseClient,
  input: ApplyAdaptationInput,
): Promise<void> {
  const { source, result } = input;
  const recipeId = source.request.recipeId;

  const { error: recipeError } = await client
    .from('recipes')
    .update({
      title: result.title,
      subtitle: result.subtitle,
      description: result.description,
    })
    .eq('id', recipeId);
  if (recipeError) throw new Error(`Título não atualizado: ${recipeError.message}`);

  /* ── Ingredients ──────────────────────────────────────────────────────── */
  const ingredientById = new Map(result.ingredients.map((item) => [item.id, item]));
  const ingredientRows = source.ingredientRows
    .map((row) => {
      const adapted = ingredientById.get(row.id);
      if (!adapted) return null;
      return {
        id: row.id,
        recipe_id: row.recipe_id,
        position: row.position,
        display_name: adapted.displayName,
        // The substitution reason is worth keeping on the line: it is what the
        // cook needs to understand why the recipe no longer says crème fraîche.
        note: [adapted.note, adapted.substitution].filter(Boolean).join(' · ') || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (ingredientRows.length > 0) {
    const { error } = await client.from('recipe_ingredients').upsert(ingredientRows);
    if (error) throw new Error(`Ingredientes não atualizados: ${error.message}`);
  }

  /* ── Steps ────────────────────────────────────────────────────────────── */
  const stepById = new Map(result.steps.map((step) => [step.id, step]));
  const stepRows = source.stepRows
    .map((row) => {
      const adapted = stepById.get(row.id);
      if (!adapted) return null;
      return {
        id: row.id,
        path_id: row.path_id,
        position: row.position,
        is_micro: row.is_micro,
        verb: adapted.verb,
        instruction: adapted.instruction,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (stepRows.length > 0) {
    const { error } = await client.from('cooking_steps').upsert(stepRows);
    if (error) throw new Error(`Passos não atualizados: ${error.message}`);
  }

  /* ── Notes ────────────────────────────────────────────────────────────── */
  const noteById = new Map(result.notes.map((note) => [note.id, note]));
  const noteRows = source.noteRows
    .map((row) => {
      const adapted = noteById.get(row.id);
      if (!adapted) return null;
      return {
        id: row.id,
        recipe_id: row.recipe_id,
        kind: row.kind,
        position: row.position,
        title: adapted.title,
        body: adapted.body,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (noteRows.length > 0) {
    const { error } = await client.from('recipe_notes').upsert(noteRows);
    if (error) throw new Error(`Notas não atualizadas: ${error.message}`);
  }

  /* ── The audit trail ──────────────────────────────────────────────────── */
  // `adaptation_logs` exists for exactly this: the concept document requires an
  // AI rewrite to be traceable and undoable, and both halves are stored so the
  // French original can be restored from this row alone.
  const { error: logError } = await client.from('adaptation_logs').insert({
    user_id: input.userId,
    recipe_id: recipeId,
    kind: 'rewrite',
    prompt: `Adaptação pt-BR de "${source.request.title}"`,
    model_used: input.model,
    payload: {
      before: source.request,
      after: result,
      warnings: input.validation.warnings.map((warning) => warning.message),
    } as unknown as Json,
    accepted: null,
  });
  if (logError) throw new Error(`Registro da adaptação falhou: ${logError.message}`);
}
