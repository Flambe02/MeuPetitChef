import type { ChefMode, EquipmentType, UnitKind } from '@/domain/types';
import { supabase } from '@/lib/supabase/client';
import { DataError, readFunctionError, unwrap } from '@/lib/supabase/errors';

import { normalizeDials } from './dials';

/* ---------------------------------------------------------------------------
 * The shape the Edge Function returns. Mirrors the JSON schema it enforces —
 * keep the two in step, they are one contract written twice.
 * ------------------------------------------------------------------------- */

export interface GeneratedStep {
  verb: string | null;
  instruction: string;
  equipment: EquipmentType;
  duration_seconds: number | null;
  alert_text: string | null;
  dials: {
    kind: 'tempo' | 'temperatura' | 'velocidade' | 'potencia' | 'alerta' | 'modo';
    value_num: number | null;
    value_text: string | null;
    sub_label: string | null;
  }[];
}

export interface GeneratedRecipe {
  title: string;
  subtitle: string | null;
  description: string;
  total_minutes: number;
  active_minutes: number | null;
  servings: number;
  difficulty: 'facil' | 'medio' | 'dificil';
  nutrition: {
    kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
  };
  ingredients: {
    group: string | null;
    display_name: string;
    quantity: number | null;
    unit: string | null;
    unit_kind: UnitKind;
    note: string | null;
  }[];
  paths: {
    name: string;
    reason: string | null;
    total_minutes: number | null;
    required_equipment: EquipmentType[];
    steps: GeneratedStep[];
  }[];
}

export interface GenerateInput {
  prompt: string;
  equipment: EquipmentType[];
  mode: ChefMode;
  servings: number;
  turns?: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * Asks the chef for a recipe.
 *
 * Goes through the `generate-recipe` Edge Function, never OpenAI directly: the
 * key lives on the server precisely so it cannot be read out of this bundle.
 */
export async function generateRecipe(input: GenerateInput): Promise<GeneratedRecipe> {
  // Cast at the boundary: `functions.invoke` types its payload as `any`, and
  // destructuring that straight into locals launders the unsafety silently.
  const { data, error } = (await supabase.functions.invoke('generate-recipe', {
    body: input,
  })) as { data: { recipe?: GeneratedRecipe; error?: string } | null; error: unknown };

  if (error) {
    // The function answers with a readable pt-BR message in `error`; surface it
    // when we have it rather than the transport's own wording.
    const detail = await readFunctionError(error);
    throw new DataError(detail ?? 'O chef não conseguiu responder agora.', { cause: error });
  }
  if (data?.error) throw new DataError(data.error);
  if (!data?.recipe) throw new DataError('Resposta vazia do chef.');
  return data.recipe;
}

/* ---------------------------------------------------------------------------
 * Materialisation
 * ------------------------------------------------------------------------- */

function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  // Suffixed because `recipes.slug` is globally unique and two cooks will
  // eventually ask for "frango com legumes" on the same day.
  return `${base || 'receita'}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Writes a generated recipe into the database as the caller's private draft.
 *
 * This is what makes the landscape cook screens work on generated content: they
 * read `recipes` / `cooking_paths` / `cooking_steps` and nothing else, so a
 * recipe that only existed in memory could never be cooked, favourited, or
 * pushed to the shopping list. Migration 12 added the policies that let a user
 * create — and only ever create — their own drafts.
 *
 * Not a transaction: PostgREST has no multi-statement transaction. The recipe
 * row is written first and everything hangs off it by foreign key, so a failure
 * halfway leaves an incomplete draft rather than orphans — and the draft is
 * private, so nobody else can see it.
 */
export async function saveGeneratedDraft(
  userId: string,
  recipe: GeneratedRecipe,
  mode: ChefMode,
  /**
   * A photo to link, when the recipe came from somewhere that had one. Not
   * downloaded and not re-hosted — see migration 16. A post's `og:image` is
   * exactly this, and it is the difference between a recipe with a picture and
   * a grey rectangle.
   */
  photoUrl: string | null = null,
): Promise<{ id: string; slug: string }> {
  const slug = slugify(recipe.title);

  const row = unwrap(
    await supabase
      .from('recipes')
      .insert({
        slug,
        title: recipe.title,
        subtitle: recipe.subtitle,
        description: recipe.description,
        photo_url: photoUrl,
        author_name: 'Seu chef',
        difficulty: recipe.difficulty,
        total_minutes: Math.max(1, recipe.total_minutes),
        active_minutes:
          recipe.active_minutes && recipe.active_minutes <= recipe.total_minutes
            ? recipe.active_minutes
            : null,
        default_servings: Math.min(30, Math.max(1, recipe.servings)),
        status: 'draft',
        created_by: userId,
      })
      .select('id, slug')
      .single(),
  );

  // The variant carries the nutrition, and its existence is what makes the
  // recipe sheet say "Adaptada ao seu perfil" for this chef.
  unwrap(
    await supabase
      .from('recipe_variants')
      .insert({
        recipe_id: row.id,
        mode,
        kcal: recipe.nutrition.kcal,
        protein_g: recipe.nutrition.protein_g,
        carbs_g: recipe.nutrition.carbs_g,
        fat_g: recipe.nutrition.fat_g,
        fiber_g: recipe.nutrition.fiber_g,
        summary: recipe.subtitle,
        changes: [],
      })
      .select('id'),
  );

  // Groups, deduped in author order.
  const groupNames = [
    ...new Set(recipe.ingredients.map((i) => i.group).filter(Boolean)),
  ] as string[];
  const groupIdByName = new Map<string, string>();
  if (groupNames.length > 0) {
    const groups = unwrap(
      await supabase
        .from('recipe_ingredient_groups')
        .insert(groupNames.map((name, position) => ({ recipe_id: row.id, name, position })))
        .select('id, name'),
    );
    for (const group of groups) groupIdByName.set(group.name, group.id);
  }

  unwrap(
    await supabase
      .from('recipe_ingredients')
      .insert(
        recipe.ingredients.map((item, position) => ({
          recipe_id: row.id,
          group_id: item.group ? (groupIdByName.get(item.group) ?? null) : null,
          position,
          display_name: item.display_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_kind: item.unit_kind,
          note: item.note,
        })),
      )
      .select('id'),
  );

  const paths = unwrap(
    await supabase
      .from('cooking_paths')
      .insert(
        recipe.paths.map((path, position) => ({
          recipe_id: row.id,
          slug: `p${position + 1}`,
          name: path.name,
          required_equipment: path.required_equipment,
          total_minutes: path.total_minutes ?? recipe.total_minutes,
          reason: path.reason,
          is_recommended: position === 0,
          position,
        })),
      )
      .select('id'),
  );

  for (const [index, path] of recipe.paths.entries()) {
    const pathId = paths[index]?.id;
    if (!pathId) continue;

    const steps = unwrap(
      await supabase
        .from('cooking_steps')
        .insert(
          path.steps.map((step, position) => ({
            path_id: pathId,
            position,
            is_micro: false,
            verb: step.verb,
            instruction: step.instruction,
            equipment: step.equipment,
            duration_seconds: step.duration_seconds,
            // The table checks `not timer_enabled or duration_seconds is not null`.
            timer_enabled: step.duration_seconds !== null && step.duration_seconds > 0,
            alert_text: step.alert_text,
          })),
        )
        .select('id'),
    );

    // Cleaned first: a repeated kind violates unique (step_id, kind) and a
    // valueless dial violates dial_has_a_value — either one throws here, with
    // the recipe already half-written.
    const dials = path.steps.flatMap((step, position) =>
      normalizeDials(step).map((dial, dialPosition) => ({
        step_id: steps[position]?.id,
        kind: dial.kind,
        value_num: dial.value_num,
        value_text: dial.value_text,
        sub_label: dial.sub_label,
        position: dialPosition,
      })),
    );
    const valid = dials.filter((dial): dial is typeof dial & { step_id: string } =>
      Boolean(dial.step_id),
    );
    if (valid.length > 0) {
      unwrap(await supabase.from('cooking_step_dials').insert(valid).select('step_id'));
    }
  }

  return { id: row.id, slug: row.slug };
}

/**
 * Adds a route through a different appliance to an existing recipe.
 *
 * "I do have a Thermomix, rewrite it for that" is a different question from
 * "invent me a recipe": the dish, the ingredients and the servings are settled,
 * only the route changes. So the chef is given the recipe as context and asked
 * for one path, which is appended to the recipe rather than replacing it — the
 * cook can still pick the old one on the sheet.
 *
 * Only works on a draft the caller authored: the RLS policies from migration 12
 * refuse the write otherwise, which is exactly the intended limit.
 */
export async function addPathForEquipment(input: {
  recipeId: string;
  title: string;
  ingredients: string[];
  equipment: EquipmentType;
  equipmentLabel: string;
  mode: ChefMode;
  servings: number;
  existingPaths: number;
}): Promise<void> {
  const generated = await generateRecipe({
    prompt: [
      `Reescreva o preparo de "${input.title}" para usar ${input.equipmentLabel}.`,
      `Mantenha exatamente os mesmos ingredientes: ${input.ingredients.join(', ')}.`,
      `Mantenha ${input.servings} porções.`,
      `Devolva UM único caminho, executável do início ao fim com ${input.equipmentLabel}.`,
    ].join(' '),
    equipment: [input.equipment, 'none'],
    mode: input.mode,
    servings: input.servings,
  });

  const path = generated.paths[0];
  if (!path) throw new DataError('O chef não conseguiu montar esse caminho.');

  const [row] = unwrap(
    await supabase
      .from('cooking_paths')
      .insert({
        recipe_id: input.recipeId,
        slug: `p${input.existingPaths + 1}`,
        name: path.name,
        required_equipment: path.required_equipment,
        total_minutes: path.total_minutes ?? generated.total_minutes,
        reason: path.reason,
        is_recommended: false,
        position: input.existingPaths,
      })
      .select('id'),
  );
  if (!row) throw new DataError('Não foi possível salvar o caminho.');

  const steps = unwrap(
    await supabase
      .from('cooking_steps')
      .insert(
        path.steps.map((step, position) => ({
          path_id: row.id,
          position,
          is_micro: false,
          verb: step.verb,
          instruction: step.instruction,
          equipment: step.equipment,
          duration_seconds: step.duration_seconds,
          timer_enabled: step.duration_seconds !== null && step.duration_seconds > 0,
          alert_text: step.alert_text,
        })),
      )
      .select('id'),
  );

  // Same cleaning as saveGeneratedDraft — this is the air-fryer conversion
  // path, so it is if anything the more likely of the two to be handed a
  // power level where a temperature belongs.
  const dials = path.steps.flatMap((step, position) =>
    normalizeDials(step).map((dial, dialPosition) => ({
      step_id: steps[position]?.id,
      kind: dial.kind,
      value_num: dial.value_num,
      value_text: dial.value_text,
      sub_label: dial.sub_label,
      position: dialPosition,
    })),
  );
  const valid = dials.filter((dial): dial is typeof dial & { step_id: string } =>
    Boolean(dial.step_id),
  );
  if (valid.length > 0) {
    unwrap(await supabase.from('cooking_step_dials').insert(valid).select('step_id'));
  }
}

/** Records the conversation, so a refinement keeps its history. */
export async function startGeneration(userId: string, input: GenerateInput): Promise<string> {
  const row = unwrap(
    await supabase
      .from('recipe_generations')
      .insert({
        user_id: userId,
        prompt: input.prompt,
        equipment: input.equipment,
        mode: input.mode,
        servings: input.servings,
        turns: input.turns ?? [],
        status: 'extracting',
      })
      .select('id')
      .single(),
  );
  return row.id;
}

export async function finishGeneration(
  generationId: string,
  patch: {
    recipeId?: string;
    turns?: { role: 'user' | 'assistant'; content: string }[];
    status: 'needs_review' | 'accepted' | 'failed';
    error?: string;
  },
): Promise<void> {
  unwrap(
    await supabase
      .from('recipe_generations')
      .update({
        recipe_id: patch.recipeId ?? null,
        // Spread rather than `?? undefined`: an explicit `undefined` would be
        // sent as a column to null out.
        ...(patch.turns ? { turns: patch.turns } : {}),
        status: patch.status,
        error_message: patch.error ?? null,
      })
      .eq('id', generationId)
      .select('id'),
  );
}
