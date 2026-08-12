import { CHEF_MODES } from '@/domain/chef-modes';
import type {
  ChefMode,
  CookingPath,
  CookingStep,
  EquipmentType,
  IngredientGroup,
  IngredientLine,
  RecipeCard,
  RecipeCardRow,
  RecipeDetail,
  RecipeNote,
  StepDial,
  VariantNutrition,
} from '@/domain/types';
import { storageUrl, supabase } from '@/lib/supabase/client';
import { unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import type { RecipeSearchParams } from '@/lib/query/keys';

/* ---------------------------------------------------------------------------
 * Mapping
 *
 * The recipe_cards view is nullable on every column because Postgres cannot
 * prove NOT NULL through a view. Narrowing happens here, once, so screens work
 * with a clean non-null shape.
 * ------------------------------------------------------------------------- */

function toVariants(raw: unknown): Partial<Record<ChefMode, VariantNutrition>> {
  if (raw === null || typeof raw !== 'object') return {};
  const source = raw as Record<string, Partial<VariantNutrition> | undefined>;
  const out: Partial<Record<ChefMode, VariantNutrition>> = {};
  for (const { id: mode } of CHEF_MODES) {
    const entry = source[mode];
    if (!entry?.id) continue;
    out[mode] = {
      id: entry.id,
      kcal: entry.kcal ?? null,
      protein_g: entry.protein_g ?? null,
      carbs_g: entry.carbs_g ?? null,
      fat_g: entry.fat_g ?? null,
      fiber_g: entry.fiber_g ?? null,
      summary: entry.summary ?? null,
      changes: entry.changes ?? [],
    };
  }
  return out;
}

export function mapRecipeCard(row: RecipeCardRow): RecipeCard {
  return {
    id: row.id ?? '',
    slug: row.slug ?? '',
    title: row.title ?? 'Receita sem título',
    subtitle: row.subtitle,
    heroImagePath: row.hero_image_path,
    heroImageUrl: storageUrl('recipe-images', row.hero_image_path),
    authorName: row.author_name ?? 'Petit Chef',
    cuisine: row.cuisine,
    category: row.category,
    difficulty: row.difficulty ?? 'facil',
    totalMinutes: row.total_minutes ?? 0,
    activeMinutes: row.active_minutes,
    defaultServings: row.default_servings ?? 2,
    ratingAvg: row.rating_avg ?? 0,
    ratingCount: row.rating_count ?? 0,
    equipment: row.equipment ?? [],
    tags: row.tags ?? [],
    variants: toVariants(row.variants),
  };
}

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------- */

/** Catalogue + search. Everything the Buscar screen filters on goes through the
 *  `search_recipes` RPC so the filtering happens in Postgres, not the phone. */
export async function searchRecipes(params: RecipeSearchParams = {}): Promise<RecipeCard[]> {
  const rows = unwrap(
    await supabase.rpc('search_recipes', {
      query: params.query ?? undefined,
      equipment_filter: params.equipment?.length ? params.equipment : undefined,
      max_total_minutes: params.maxTotalMinutes,
      max_kcal: params.maxKcal,
      min_protein_g: params.minProteinG,
      mode_filter: params.mode ?? 'normal',
      page_limit: 48,
    }),
  );
  return rows.map(mapRecipeCard);
}

/* The shape of the single nested select that builds a recipe detail. Written
   once as a constant so the query and its types cannot drift apart. */
const DETAIL_SELECT = `
  id, slug, title, subtitle, description, hero_image_path, author_name, cuisine, category,
  difficulty, total_minutes, active_minutes, default_servings, rating_avg, rating_count, status,
  recipe_variants ( id, mode, kcal, protein_g, carbs_g, fat_g, fiber_g, summary, changes ),
  recipe_ingredient_groups ( id, name, position ),
  recipe_ingredients (
    id, group_id, ingredient_id, position, display_name, quantity, unit, unit_kind, note,
    is_optional, is_scalable
  ),
  recipe_notes ( id, kind, title, body, position ),
  cooking_paths (
    id, slug, name, required_equipment, total_minutes, active_minutes, is_recommended, reason,
    vessel_count, position,
    cooking_steps (
      id, position, is_micro, verb, instruction, equipment, duration_seconds, timer_enabled,
      alert_text, can_run_parallel, depends_on_step_id,
      cooking_step_dials ( kind, value_num, value_text, sub_label, position )
    )
  )
` as const;

interface RawDial {
  kind: StepDial['kind'];
  value_num: number | null;
  value_text: string | null;
  sub_label: string | null;
  position: number;
}

interface RawStep {
  id: string;
  position: number;
  is_micro: boolean;
  verb: string | null;
  instruction: string;
  equipment: EquipmentType;
  duration_seconds: number | null;
  timer_enabled: boolean;
  alert_text: string | null;
  can_run_parallel: boolean;
  depends_on_step_id: string | null;
  cooking_step_dials: RawDial[];
}

interface RawPath {
  id: string;
  slug: string;
  name: string;
  required_equipment: EquipmentType[];
  total_minutes: number | null;
  active_minutes: number | null;
  is_recommended: boolean;
  reason: string | null;
  vessel_count: number | null;
  position: number;
  cooking_steps: RawStep[];
}

function mapStep(raw: RawStep): CookingStep {
  return {
    id: raw.id,
    position: raw.position,
    verb: raw.verb,
    instruction: raw.instruction,
    equipment: raw.equipment,
    durationSeconds: raw.duration_seconds,
    timerEnabled: raw.timer_enabled,
    alertText: raw.alert_text,
    canRunParallel: raw.can_run_parallel,
    dependsOnStepId: raw.depends_on_step_id,
    dials: [...raw.cooking_step_dials]
      .sort((a, b) => a.position - b.position)
      .map((dial) => ({
        kind: dial.kind,
        valueNum: dial.value_num,
        valueText: dial.value_text,
        subLabel: dial.sub_label,
      })),
  };
}

/**
 * One recipe, fully composed: variants, grouped ingredients (rewritten for the
 * requested chef mode), every cooking path with its steps and dials, and notes.
 *
 * Path fit scores come from a second call to `recipe_paths_for_me`, which needs
 * the caller's equipment and therefore cannot be part of the nested select.
 */
export async function getRecipeDetail(
  slug: string,
  mode: ChefMode = 'normal',
): Promise<RecipeDetail | null> {
  const row = unwrapMaybe(
    await supabase.from('recipes').select(DETAIL_SELECT).eq('slug', slug).maybeSingle(),
  );
  if (!row) return null;

  const variantsByMode = new Map(row.recipe_variants.map((v) => [v.mode, v]));
  const activeVariant = variantsByMode.get(mode);

  // Variant rewrites are fetched separately: they hang off the variant, not the
  // recipe, and pulling them through the nested select would duplicate rows.
  const overrides = activeVariant
    ? unwrap(
        await supabase
          .from('recipe_variant_ingredients')
          .select('recipe_ingredient_id, is_removed, display_name, quantity, unit, unit_kind, note')
          .eq('variant_id', activeVariant.id),
      )
    : [];
  const overrideById = new Map(overrides.map((o) => [o.recipe_ingredient_id, o]));

  const groupsById = new Map(row.recipe_ingredient_groups.map((g) => [g.id, g]));

  const lines: IngredientLine[] = row.recipe_ingredients
    .map((ing): IngredientLine => {
      const override = overrideById.get(ing.id);
      return {
        id: ing.id,
        groupId: ing.group_id,
        groupName: ing.group_id ? (groupsById.get(ing.group_id)?.name ?? null) : null,
        ingredientId: ing.ingredient_id,
        displayName: override?.display_name ?? ing.display_name,
        quantity: override?.quantity ?? ing.quantity,
        unit: override?.unit ?? ing.unit,
        unitKind: override?.unit_kind ?? ing.unit_kind,
        note: override?.note ?? ing.note,
        isOptional: ing.is_optional,
        isScalable: ing.is_scalable,
        variantChange: override ? (override.is_removed ? 'removed' : 'replaced') : null,
      };
    })
    .filter((line) => line.variantChange !== 'removed')
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));

  // Preserve the author's group order, and keep ungrouped lines last.
  const orderedGroups = [...row.recipe_ingredient_groups].sort((a, b) => a.position - b.position);
  const groups: IngredientGroup[] = orderedGroups
    .map((group) => ({
      id: group.id,
      name: group.name,
      items: row.recipe_ingredients
        .filter((ing) => ing.group_id === group.id)
        .sort((a, b) => a.position - b.position)
        .map((ing) => lines.find((line) => line.id === ing.id))
        .filter((line): line is IngredientLine => line !== undefined),
    }))
    .filter((group) => group.items.length > 0);

  const ungrouped = lines.filter((line) => line.groupId === null);
  if (ungrouped.length > 0) groups.push({ id: null, name: 'Ingredientes', items: ungrouped });

  const fitScores = await getPathFitScores(row.id);

  const paths: CookingPath[] = (row.cooking_paths as RawPath[])
    .map((path): CookingPath => {
      const steps = path.cooking_steps
        .filter((s) => !s.is_micro)
        .sort((a, b) => a.position - b.position);
      const micro = path.cooking_steps
        .filter((s) => s.is_micro)
        .sort((a, b) => a.position - b.position);
      const fit = fitScores.get(path.id);
      return {
        id: path.id,
        slug: path.slug,
        name: path.name,
        requiredEquipment: path.required_equipment,
        totalMinutes: path.total_minutes,
        activeMinutes: path.active_minutes,
        isRecommended: path.is_recommended,
        reason: path.reason,
        vesselCount: path.vessel_count,
        fitScore: fit?.score ?? 0,
        missingEquipment: fit?.missing ?? [],
        steps: steps.map(mapStep),
        // Guided mode falls back to the readable steps when no micro-steps exist.
        microSteps: (micro.length > 0 ? micro : steps).map(mapStep),
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore || Number(b.isRecommended) - Number(a.isRecommended));

  const notes: RecipeNote[] = [...row.recipe_notes]
    .sort((a, b) => a.position - b.position)
    .map((note) => ({ id: note.id, kind: note.kind, title: note.title, body: note.body }));

  const variants: Partial<Record<ChefMode, VariantNutrition>> = {};
  for (const variant of row.recipe_variants) {
    variants[variant.mode] = {
      id: variant.id,
      kcal: variant.kcal,
      protein_g: variant.protein_g,
      carbs_g: variant.carbs_g,
      fat_g: variant.fat_g,
      fiber_g: variant.fiber_g,
      summary: variant.summary,
      changes: variant.changes,
    };
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    status: row.status,
    heroImagePath: row.hero_image_path,
    heroImageUrl: storageUrl('recipe-images', row.hero_image_path),
    authorName: row.author_name,
    cuisine: row.cuisine,
    category: row.category,
    difficulty: row.difficulty,
    totalMinutes: row.total_minutes,
    activeMinutes: row.active_minutes,
    defaultServings: row.default_servings,
    ratingAvg: row.rating_avg,
    ratingCount: row.rating_count,
    equipment: [...new Set(paths.flatMap((p) => p.requiredEquipment))],
    tags: [],
    variants,
    groups,
    paths,
    notes,
  };
}

/** How well each cooking path fits the caller's kitchen. */
async function getPathFitScores(
  recipeId: string,
): Promise<Map<string, { score: number; missing: EquipmentType[] }>> {
  const rows = unwrap(await supabase.rpc('recipe_paths_for_me', { target_recipe: recipeId }));
  const scores = new Map<string, { score: number; missing: EquipmentType[] }>();
  for (const row of rows) {
    if (!row.id) continue;
    scores.set(row.id, { score: row.fit_score ?? 0, missing: row.missing_equipment ?? [] });
  }
  return scores;
}

/**
 * Home-screen suggestions, ranked by the caller's own kitchen.
 *
 * The ranking happens in `suggest_recipes` rather than here because the fit
 * score needs `profile_equipment`, and pulling every published recipe to the
 * phone just to sort it would be the N+1 the `recipe_cards` view exists to
 * avoid.
 */
export async function getSuggestions(mode: ChefMode = 'normal', limit = 6): Promise<RecipeCard[]> {
  const rows = unwrap(
    await supabase.rpc('suggest_recipes', { target_mode: mode, page_limit: limit }),
  );
  return rows.map(mapRecipeCard);
}
