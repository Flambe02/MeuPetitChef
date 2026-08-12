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
import { DataError } from '@/lib/supabase/errors';
import { machineFacts } from '@/lib/recipe-import/adapt';
import {
  buildBrief,
  checkOriginality,
  extractFacts,
  type RecipeFacts,
  type TechniqueFact,
} from '@/lib/recipe-import/reference';
import type { ImportOutcome } from '@/features/import/api';
import type { ValidationResult } from '@/lib/recipe-import/types';
import { generateRecipe, saveGeneratedDraft, type GeneratedRecipe } from '@/features/generate/api';

export interface VersionFromImportInput {
  outcome: ImportOutcome;
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
 * The same thing, from an import that has not been saved — and may not be
 * saveable.
 *
 * "Cozinhar agora" has to work on what a caption actually gives, which is
 * frequently a list of ingredients and a method with no serving count, no total
 * time, and sometimes no steps at all. Waiting for that import to pass
 * validation and reach the database first would refuse exactly the cases the
 * button exists for.
 *
 * So the facts are taken from the canonical recipe in memory. What the source
 * left out, the chef fills in — that is the *point* of this path, not a
 * shortcut: it is writing a recipe for the appliances this cook owns, and a
 * recipe it writes has servings, timings and dials whether the post had them or
 * not. Nothing of the source's prose travels: `extractFacts` drops it, here as
 * everywhere else.
 */
export async function createVersionFromImport(
  userId: string,
  input: VersionFromImportInput,
): Promise<OwnVersionOutcome> {
  const recipe = input.outcome.recipe;
  const steps = recipe.paths.flatMap((path) => path.steps);

  const facts = extractFacts(
    {
      recipeId: '',
      sourceLanguage: recipe.language,
      title: recipe.title,
      subtitle: recipe.subtitle,
      description: recipe.description,
      servings: recipe.servings,
      ingredients: recipe.ingredients.map((ingredient, index) => ({
        id: String(index),
        displayName: ingredient.normalizedName ?? ingredient.sourceName,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        note: ingredient.note,
      })),
      steps: steps.map((step, index) => ({
        id: String(index),
        verb: step.verb,
        instruction: step.instruction,
      })),
      notes: [],
    },
    steps.map((step) => ({ equipment: step.equipment, instruction: step.instruction })),
    input.outcome.provider,
  );

  const equipment = input.equipment.length > 0 ? input.equipment : (['none'] as EquipmentType[]);
  const servings = input.servings ?? facts.servings;

  const generated = await generateRecipe({
    prompt: buildBrief({ ...facts, servings }, equipment),
    equipment,
    mode: input.mode,
    servings,
  });

  const originality = checkOriginality(
    { instructions: steps.map((step) => step.instruction), techniques: facts.techniques },
    {
      instructions: generated.paths.flatMap((path) => path.steps.map((step) => step.instruction)),
      techniques: techniquesOf(generated),
    },
  );

  if (!originality.ok) {
    throw new DataError(
      `A receita gerada ficou perto demais da referência: ${originality.errors
        .map((issue) => issue.message)
        .join(' · ')}`,
    );
  }

  const saved = await saveGeneratedDraft(userId, generated, input.mode);
  return { recipe: saved, facts, originality };
}

/*
 * There used to be a second entry point here, `createOwnVersion`, which did the
 * same work starting from a reference already saved in the database. It went
 * with the two-step screen it belonged to: import, then save, then press
 * "Criar minha versão". One button now does the whole thing, and it does it
 * from the import in memory — which also works for the many captions that never
 * pass validation and so never become a row at all.
 */
