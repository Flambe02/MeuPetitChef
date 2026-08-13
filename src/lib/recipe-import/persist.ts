/**
 * Writing an import into Supabase.
 *
 * Takes the client as an argument rather than importing the app singleton: the
 * CLI runs with a service-role key and the browser runs with the user's
 * session, and this file has to work under both. It is also why nothing here
 * touches `import.meta.env`.
 *
 * The write follows the same order as `features/generate/api.ts`: the recipe
 * row first, everything else hanging off it by foreign key. PostgREST has no
 * multi-statement transaction, so a failure halfway leaves an incomplete
 * *draft* — private, reviewable, deletable — rather than orphaned rows.
 *
 * Imported recipes are always drafts. Publishing is a human decision, and the
 * RLS policies from migration 12 would refuse anything else from the browser.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/lib/supabase/database.types';

import type { CanonicalRecipe, ValidationResult } from './types.ts';
import { toMinutes } from './duration.ts';
import { stepDials } from './step-normalizer.ts';

export type ImportSupabaseClient = SupabaseClient<Database, 'public'>;

export interface DuplicateMatch {
  reason: 'external_id' | 'fingerprint' | 'source_url';
  importId: string | null;
  recipeId: string | null;
  title: string | null;
}

/**
 * Looks for an earlier import of the same recipe.
 *
 * Three probes, cheapest and most certain first. The database also enforces
 * `(provider, external_id)` with a unique index — this exists so the CLI can
 * *say* what it found instead of surfacing a 23505.
 */
export async function findDuplicate(
  client: ImportSupabaseClient,
  recipe: CanonicalRecipe,
): Promise<DuplicateMatch | null> {
  const { provider, externalId, url } = recipe.source;

  if (externalId) {
    const { data } = await client
      .from('recipe_imports')
      .select('id, recipe_id')
      .eq('provider', provider)
      .eq('external_id', externalId)
      .limit(1);
    const row = data?.[0];
    if (row) {
      return { reason: 'external_id', importId: row.id, recipeId: row.recipe_id, title: null };
    }
  }

  const { data: byFingerprint } = await client
    .from('recipe_imports')
    .select('id, recipe_id')
    .eq('fingerprint', recipe.fingerprint)
    .limit(1);
  const fingerprintRow = byFingerprint?.[0];
  if (fingerprintRow) {
    return {
      reason: 'fingerprint',
      importId: fingerprintRow.id,
      recipeId: fingerprintRow.recipe_id,
      title: null,
    };
  }

  if (url) {
    const { data: byUrl } = await client
      .from('recipes')
      .select('id, title')
      .eq('source_url', url)
      .limit(1);
    const recipeRow = byUrl?.[0];
    if (recipeRow) {
      return {
        reason: 'source_url',
        importId: null,
        recipeId: recipeRow.id,
        title: recipeRow.title,
      };
    }
  }

  return null;
}

/* ---------------------------------------------------------------------------
 * The import row
 * ------------------------------------------------------------------------- */

export interface RecordImportInput {
  /** Null for a machine import run by the CLI; the row is then service-role only. */
  userId: string | null;
  recipe: CanonicalRecipe;
  rawPayload: unknown;
  validation: ValidationResult;
}

/**
 * Stores the raw payload and the normalized recipe side by side, so a parser
 * fix can be replayed without touching the network again.
 *
 * `needs_review` unless validation failed, in which case `failed` plus the
 * reason — the enum has no `rejected`, and a rejection *is* a failed import
 * with an explanation (see migration 13).
 */
export async function recordImport(
  client: ImportSupabaseClient,
  input: RecordImportInput,
): Promise<string> {
  const { recipe, validation } = input;

  // 'file' never came from a fetch — it is text or a file the person handed
  // the screen directly. Every other provider is read off a URL, screenshots
  // aside (which do not reach this far without one either).
  const source = recipe.source.provider === 'file' ? 'text' : 'url';

  // `import_has_a_source` requires source_url, raw_text or raw_file_path —
  // a 'file' import usually has none of the first, having arrived with no
  // URL at all, so the payload itself stands in as the record of what was
  // read. Harmless to include even when a URL is also present.
  const rawText = source === 'text' ? JSON.stringify(input.rawPayload ?? {}) : null;

  const { data, error } = await client
    .from('recipe_imports')
    .insert({
      user_id: input.userId,
      source,
      source_url: recipe.source.url,
      raw_text: rawText,
      provider: recipe.source.provider,
      external_id: recipe.source.externalId,
      raw_data: input.rawPayload as Json,
      extracted: recipe as unknown as Json,
      fingerprint: recipe.fingerprint,
      warnings: validation.warnings.map((warning) => warning.message),
      status: validation.ok ? 'needs_review' : 'failed',
      error_message: validation.ok ? null : validation.errors.map((e) => e.message).join(' · '),
    })
    .select('id')
    .single();

  if (error) throw new Error(`Não foi possível registrar o import: ${error.message}`);
  return data.id;
}

/* ---------------------------------------------------------------------------
 * The recipe
 * ------------------------------------------------------------------------- */

export interface SaveRecipeInput {
  recipe: CanonicalRecipe;
  /**
   * Author of the draft. Required from the browser — the RLS policy is
   * `created_by = auth.uid() and status = 'draft'` — and optional from the CLI,
   * where the service role writes catalogue drafts owned by nobody.
   */
  userId: string | null;
  /** Set to `accepted` and pointed at the new recipe when given. */
  importId?: string | null;
  /**
   * Overrides `photo_url` when the source had no `imageUrl` of its own — an
   * AI-generated JSON/Markdown import, for instance, never has one. Provenance
   * (`source_image_url`) is untouched either way: it still reflects only what
   * the source itself provided.
   */
  photoUrl?: string | null;
}

export interface SavedRecipe {
  id: string;
  slug: string;
}

export async function saveImportedRecipe(
  client: ImportSupabaseClient,
  input: SaveRecipeInput,
): Promise<SavedRecipe> {
  const { recipe } = input;

  const totalMinutes = Math.max(1, toMinutes(recipe.totalTimeSeconds) ?? 1);
  const activeMinutes = toMinutes(recipe.prepTimeSeconds);

  const { data: row, error } = await client
    .from('recipes')
    .insert({
      slug: recipe.slug,
      title: recipe.title,
      subtitle: recipe.subtitle,
      description: recipe.description,
      author_name: recipe.source.authorName ?? recipe.source.provider,
      cuisine: recipe.cuisine,
      category: recipe.category,
      difficulty: recipe.difficulty,
      total_minutes: totalMinutes,
      // The table checks `active_minutes <= total_minutes`.
      active_minutes:
        activeMinutes !== null && activeMinutes <= totalMinutes ? activeMinutes : null,
      default_servings: recipe.servings,
      status: 'draft',
      created_by: input.userId,
      source_provider: recipe.source.provider,
      source_url: recipe.source.url,
      source_image_url: recipe.source.imageUrl,
      // `source_image_url` is provenance (migration 16: "kept for review
      // only"); `photo_url` is what every screen actually renders. An
      // imported recipe's own photo is exactly the case migration 16 was
      // written for — a picture that already exists somewhere on the web —
      // so it is linked here too, not just recorded.
      photo_url: recipe.source.imageUrl ?? input.photoUrl ?? null,
      imported_at: recipe.source.importedAt,
    })
    .select('id, slug')
    .single();

  if (error) throw new Error(`Não foi possível salvar a receita: ${error.message}`);

  await saveVariant(client, row.id, recipe);
  const groupIdByName = await saveGroups(client, row.id, recipe);
  await saveIngredients(client, row.id, recipe, groupIdByName);
  await savePaths(client, row.id, recipe);
  await saveNotes(client, row.id, recipe);

  if (input.importId) {
    const { error: updateError } = await client
      .from('recipe_imports')
      .update({ status: 'accepted', recipe_id: row.id, reviewed_at: new Date().toISOString() })
      .eq('id', input.importId);
    if (updateError)
      throw new Error(`Receita salva, mas o import não fechou: ${updateError.message}`);
  }

  return { id: row.id, slug: row.slug };
}

/** Nutrition lives on the variant, which is what makes the recipe sheet show it. */
async function saveVariant(
  client: ImportSupabaseClient,
  recipeId: string,
  recipe: CanonicalRecipe,
): Promise<void> {
  const { error } = await client.from('recipe_variants').insert({
    recipe_id: recipeId,
    mode: recipe.nutritionMode,
    kcal: recipe.nutrition.kcal,
    protein_g: recipe.nutrition.proteinG,
    carbs_g: recipe.nutrition.carbsG,
    fat_g: recipe.nutrition.fatG,
    fiber_g: recipe.nutrition.fiberG,
    summary: null,
    changes: [],
  });
  if (error) throw new Error(`Variante não salva: ${error.message}`);
}

async function saveGroups(
  client: ImportSupabaseClient,
  recipeId: string,
  recipe: CanonicalRecipe,
): Promise<Map<string, string>> {
  const names = [
    ...new Set(
      recipe.ingredients
        .map((ingredient) => ingredient.groupName)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const byName = new Map<string, string>();
  if (names.length === 0) return byName;

  const { data, error } = await client
    .from('recipe_ingredient_groups')
    .insert(names.map((name, position) => ({ recipe_id: recipeId, name, position })))
    .select('id, name');
  if (error) throw new Error(`Grupos de ingredientes não salvos: ${error.message}`);

  for (const group of data) byName.set(group.name, group.id);
  return byName;
}

async function saveIngredients(
  client: ImportSupabaseClient,
  recipeId: string,
  recipe: CanonicalRecipe,
  groupIdByName: Map<string, string>,
): Promise<void> {
  if (recipe.ingredients.length === 0) return;

  const { error } = await client.from('recipe_ingredients').insert(
    recipe.ingredients.map((ingredient) => ({
      recipe_id: recipeId,
      group_id: ingredient.groupName ? (groupIdByName.get(ingredient.groupName) ?? null) : null,
      position: ingredient.position,
      // The source name, untranslated. `normalizedName` stays null until the
      // Brazilian adaptation pass fills it in.
      display_name: ingredient.normalizedName ?? ingredient.sourceName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      unit_kind: ingredient.unitKind,
      note: ingredient.note,
      is_optional: ingredient.isOptional,
      is_scalable: ingredient.isScalable,
    })),
  );
  if (error) throw new Error(`Ingredientes não salvos: ${error.message}`);
}

async function savePaths(
  client: ImportSupabaseClient,
  recipeId: string,
  recipe: CanonicalRecipe,
): Promise<void> {
  for (const [index, path] of recipe.paths.entries()) {
    const { data: pathRow, error } = await client
      .from('cooking_paths')
      .insert({
        recipe_id: recipeId,
        slug: path.slug,
        name: path.name,
        required_equipment: path.requiredEquipment,
        total_minutes: path.totalMinutes,
        active_minutes:
          path.activeMinutes !== null &&
          path.totalMinutes !== null &&
          path.activeMinutes <= path.totalMinutes
            ? path.activeMinutes
            : null,
        is_recommended: path.isRecommended,
        reason: path.reason,
        position: index,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Modo de preparo não salvo: ${error.message}`);
    if (path.steps.length === 0) continue;

    const { data: stepRows, error: stepError } = await client
      .from('cooking_steps')
      .insert(
        path.steps.map((step) => ({
          path_id: pathRow.id,
          position: step.position,
          is_micro: false,
          verb: step.verb,
          instruction: step.instruction,
          equipment: step.equipment,
          duration_seconds: step.durationSeconds,
          // The table checks `not timer_enabled or duration_seconds is not null`.
          timer_enabled: step.durationSeconds !== null && step.durationSeconds > 0,
          alert_text: null,
        })),
      )
      .select('id, position');
    if (stepError) throw new Error(`Passos não salvos: ${stepError.message}`);

    const idByPosition = new Map(stepRows.map((row) => [row.position, row.id]));
    const dials = path.steps.flatMap((step) => {
      const stepId = idByPosition.get(step.position);
      if (!stepId) return [];
      return stepDials(step).map((dial) => ({
        step_id: stepId,
        kind: dial.kind,
        value_num: dial.valueNum,
        value_text: dial.valueText,
        sub_label: dial.subLabel,
        position: dial.position,
      }));
    });

    if (dials.length > 0) {
      const { error: dialError } = await client.from('cooking_step_dials').insert(dials);
      if (dialError) throw new Error(`Parâmetros dos passos não salvos: ${dialError.message}`);
    }
  }
}

async function saveNotes(
  client: ImportSupabaseClient,
  recipeId: string,
  recipe: CanonicalRecipe,
): Promise<void> {
  const notes = [
    ...recipe.notes,
    // Attribution is not optional when the content originates elsewhere.
    recipe.source.url
      ? {
          kind: 'tip',
          title: 'Fonte',
          body: `Importado de ${recipe.source.provider}: ${recipe.source.url}`,
        }
      : null,
  ].filter((note): note is { kind: string; title: string | null; body: string } => note !== null);

  if (notes.length === 0) return;

  const { error } = await client.from('recipe_notes').insert(
    notes.map((note, position) => ({
      recipe_id: recipeId,
      // `recipe_notes.kind` is a checked list; anything unexpected becomes a tip.
      kind: ['tip', 'storage', 'allergen', 'substitution', 'nutrition', 'warning'].includes(
        note.kind,
      )
        ? note.kind
        : 'tip',
      title: note.title,
      body: note.body,
      position,
    })),
  );
  if (error) throw new Error(`Notas não salvas: ${error.message}`);
}
