/**
 * From a reference to your own recipe.
 *
 * An imported recipe is a *reference*: something to read, not something to
 * publish. Migration 14 makes that literal — the database refuses to publish a
 * row that carries a `source_provider`.
 *
 * This is the path out of that. It reduces the reference to what is not
 * protectable — the dish, the ingredients, the timings and temperatures — and
 * asks the chef to write an original recipe for the appliances the cook
 * actually owns. Converting a Thermomix recipe to an air fryer is not a
 * translation: the procedure genuinely changes, and what comes out is new
 * writing with no `source_provider` at all.
 *
 * `checkOriginality` is the backstop for when it does not.
 */
import type { ChefMode, EquipmentType } from '@/domain/types';
import { supabase } from '@/lib/supabase/client';
import { DataError } from '@/lib/supabase/errors';
import { machineFacts } from '@/lib/recipe-import/adapt';
import { readForAdaptation } from '@/lib/recipe-import/adapt-persist';
import {
  buildBrief,
  checkOriginality,
  extractFacts,
  type RecipeFacts,
  type TechniqueFact,
} from '@/lib/recipe-import/reference';
import type { ValidationResult } from '@/lib/recipe-import/types';
import { generateRecipe, saveGeneratedDraft, type GeneratedRecipe } from '@/features/generate/api';

export interface OwnVersionInput {
  referenceId: string;
  equipment: EquipmentType[];
  mode: ChefMode;
  servings?: number;
}

export interface OwnVersionOutcome {
  recipe: { id: string; slug: string };
  facts: RecipeFacts;
  originality: ValidationResult;
}

/** The parameter sequence a generated recipe actually ended up with. */
function techniquesOf(recipe: GeneratedRecipe): TechniqueFact[] {
  return recipe.paths
    .flatMap((path) => path.steps)
    .map((step) => ({ step, facts: machineFacts(step.instruction) }))
    .filter(
      ({ facts }) =>
        facts.durationSeconds !== null || facts.temperature !== null || facts.speed !== null,
    )
    .map(({ step, facts }) => ({
      equipment: step.equipment,
      durationSeconds: facts.durationSeconds,
      temperature: facts.temperature,
      speed: facts.speed,
    }));
}

/**
 * Reads a reference, writes an original recipe from it.
 *
 * Nothing of the reference's prose reaches the chef: `extractFacts` drops the
 * instructions, the description and the step wording, and `buildBrief` sends
 * only the dish, the ingredients and the timings. The reference itself is left
 * untouched — it stays a private draft.
 */
export async function createOwnVersion(
  userId: string,
  input: OwnVersionInput,
): Promise<OwnVersionOutcome> {
  const source = await readForAdaptation(supabase, input.referenceId);

  const steps = source.stepRows.map((row, index) => ({
    equipment: row.equipment,
    instruction: source.request.steps[index]?.instruction ?? '',
  }));

  const facts = extractFacts(source.request, steps);
  const equipment = input.equipment.length > 0 ? input.equipment : (['none'] as EquipmentType[]);
  const servings = input.servings ?? facts.servings;

  const generated = await generateRecipe({
    prompt: buildBrief({ ...facts, servings }, equipment),
    equipment,
    mode: input.mode,
    servings,
  });

  const originality = checkOriginality(
    {
      instructions: source.request.steps.map((step) => step.instruction),
      techniques: facts.techniques,
    },
    {
      instructions: generated.paths.flatMap((path) => path.steps.map((step) => step.instruction)),
      techniques: techniquesOf(generated),
    },
  );

  if (!originality.ok) {
    // Refused rather than saved-with-a-warning: a recipe that repeats the
    // source's sentences is the source's recipe, and publishing it is the one
    // thing this whole design exists to prevent.
    throw new DataError(
      `A receita gerada ficou perto demais da referência: ${originality.errors
        .map((issue) => issue.message)
        .join(' · ')}`,
    );
  }

  // Saved through the generation repository, so it lands with no
  // `source_provider` — an original recipe, publishable like any other.
  const recipe = await saveGeneratedDraft(userId, generated, input.mode);

  return { recipe, facts, originality };
}
