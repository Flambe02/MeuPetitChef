import type {
  ChefMode,
  MealPlan,
  MealPlanEntry,
  MealPlanEntryType,
  MealPlanGenerationMode,
  MealSlot,
  RecipeCard,
} from '@/domain/types';
import type { GeneratedEntryDraft, GenerationPreferences, PlannedEntry } from '@/lib/planning/types';
import { toISODate } from '@/lib/format';
import { mapRecipeCard } from '@/features/recipes/api';
import { supabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';
import { unwrap } from '@/lib/supabase/errors';

/* ---------------------------------------------------------------------------
 * meal_plans — the header row for one (user, week)
 * ------------------------------------------------------------------------- */

export async function getMealPlan(userId: string, weekStart: Date): Promise<MealPlan | null> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', toISODate(weekStart))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveMealPlan(
  userId: string,
  weekStart: Date,
  weekEnd: Date,
  generationMode: MealPlanGenerationMode | null,
  generationPreferences: GenerationPreferences,
): Promise<MealPlan> {
  return unwrap(
    await supabase
      .from('meal_plans')
      .upsert(
        {
          user_id: userId,
          week_start: toISODate(weekStart),
          week_end: toISODate(weekEnd),
          generation_mode: generationMode,
          generation_preferences: generationPreferences as unknown as Json,
        },
        { onConflict: 'user_id,week_start' },
      )
      .select('*')
      .single(),
  );
}

/* ---------------------------------------------------------------------------
 * meal_plan_entries — the slots themselves
 * ------------------------------------------------------------------------- */

export async function listWeekPlan(userId: string, weekStart: Date): Promise<MealPlanEntry[]> {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return unwrap(
    await supabase
      .from('meal_plan_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('plan_date', toISODate(weekStart))
      .lte('plan_date', toISODate(end))
      .order('plan_date', { ascending: true }),
  );
}

/** `recipe_cards` for a batch of ids, one round trip — never one call per entry. */
export async function getRecipeCardsByIds(ids: string[]): Promise<Map<string, RecipeCard>> {
  if (ids.length === 0) return new Map();
  const rows = unwrap(await supabase.from('recipe_cards').select('*').in('id', ids));
  return new Map(rows.filter((row) => row.id !== null).map((row) => [row.id!, mapRecipeCard(row)]));
}

/** Pairs each entry with its recipe card, resolved in one extra round trip for the whole week. */
export async function resolvePlannedEntries(entries: MealPlanEntry[]): Promise<PlannedEntry[]> {
  const ids = [...new Set(entries.map((entry) => entry.recipe_id).filter((id): id is string => id !== null))];
  const cards = await getRecipeCardsByIds(ids);
  return entries.map((entry) => ({
    entry,
    recipe: entry.recipe_id ? (cards.get(entry.recipe_id) ?? null) : null,
  }));
}

interface UpsertEntryInput {
  date: Date;
  slot: MealSlot;
  entryType: MealPlanEntryType;
  recipeId?: string | null;
  customTitle?: string | null;
  parentEntryId?: string | null;
  servings?: number;
  mode?: ChefMode | null;
  source?: 'auto' | 'manual';
  locked?: boolean;
}

/**
 * Replaces one slot's content wholesale. Always resets `status` to `planned`
 * and clears `cooked_at` — swapping what a slot holds un-cooks it, which is
 * the least surprising behaviour when the recipe underneath has changed.
 * `markCooked`/`markPlanned` are the dedicated, content-preserving way to
 * change only the lifecycle.
 */
async function upsertEntry(userId: string, input: UpsertEntryInput): Promise<MealPlanEntry> {
  return unwrap(
    await supabase
      .from('meal_plan_entries')
      .upsert(
        {
          user_id: userId,
          plan_date: toISODate(input.date),
          slot: input.slot,
          entry_type: input.entryType,
          recipe_id: input.recipeId ?? null,
          custom_title: input.customTitle ?? null,
          parent_entry_id: input.parentEntryId ?? null,
          servings: input.servings ?? 2,
          mode: input.mode ?? null,
          source: input.source ?? 'manual',
          locked: input.locked ?? false,
          status: 'planned',
          cooked_at: null,
        },
        { onConflict: 'user_id,plan_date,slot' },
      )
      .select('*')
      .single(),
  );
}

export async function setRecipeEntry(
  userId: string,
  input: {
    date: Date;
    slot: MealSlot;
    recipeId: string;
    servings?: number;
    mode?: ChefMode | null;
    source?: 'auto' | 'manual';
  },
): Promise<MealPlanEntry> {
  return upsertEntry(userId, { ...input, entryType: 'recipe' });
}

export async function setCustomEntry(
  userId: string,
  input: { date: Date; slot: MealSlot; title: string; servings?: number },
): Promise<MealPlanEntry> {
  return upsertEntry(userId, { ...input, entryType: 'recipe', customTitle: input.title });
}

export async function setLeftoverEntry(
  userId: string,
  input: { date: Date; slot: MealSlot; parentEntryId: string; recipeId: string | null; servings?: number },
): Promise<MealPlanEntry> {
  return upsertEntry(userId, { ...input, entryType: 'leftover' });
}

export async function setEatingOutEntry(
  userId: string,
  input: { date: Date; slot: MealSlot; title?: string | null },
): Promise<MealPlanEntry> {
  return upsertEntry(userId, {
    date: input.date,
    slot: input.slot,
    entryType: 'eating_out',
    customTitle: input.title ?? null,
  });
}

export async function setSkippedEntry(
  userId: string,
  input: { date: Date; slot: MealSlot },
): Promise<MealPlanEntry> {
  return upsertEntry(userId, { ...input, entryType: 'skipped' });
}

export async function clearPlanEntry(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id);
  if (error) throw error;
}

export async function setEntryLocked(id: string, locked: boolean): Promise<void> {
  unwrap(await supabase.from('meal_plan_entries').update({ locked }).eq('id', id).select('id'));
}

export async function markEntryCooked(id: string): Promise<void> {
  unwrap(
    await supabase
      .from('meal_plan_entries')
      .update({ status: 'cooked', cooked_at: new Date().toISOString() })
      .eq('id', id)
      .select('id'),
  );
}

export async function markEntryPlanned(id: string): Promise<void> {
  unwrap(
    await supabase
      .from('meal_plan_entries')
      .update({ status: 'planned', cooked_at: null })
      .eq('id', id)
      .select('id'),
  );
}

/** "Mover para outro dia" — throws (friendly, via `unwrap`) if the target slot is already taken. */
export async function moveEntry(id: string, date: Date, slot: MealSlot): Promise<MealPlanEntry> {
  return unwrap(
    await supabase
      .from('meal_plan_entries')
      .update({ plan_date: toISODate(date), slot })
      .eq('id', id)
      .select('*')
      .single(),
  );
}

export async function setEntryServings(id: string, servings: number): Promise<void> {
  unwrap(await supabase.from('meal_plan_entries').update({ servings }).eq('id', id).select('id'));
}

/** Writes a generation run's output in one round trip. */
export async function bulkUpsertEntries(
  userId: string,
  drafts: GeneratedEntryDraft[],
  mode: ChefMode,
): Promise<void> {
  if (drafts.length === 0) return;
  unwrap(
    await supabase
      .from('meal_plan_entries')
      .upsert(
        drafts.map((draft) => ({
          user_id: userId,
          plan_date: toISODate(draft.date),
          slot: draft.slot,
          entry_type: 'recipe' as const,
          recipe_id: draft.recipeId,
          servings: draft.servings,
          mode,
          source: 'auto' as const,
          status: 'planned' as const,
          cooked_at: null,
          locked: false,
        })),
        { onConflict: 'user_id,plan_date,slot' },
      )
      .select('id'),
  );
}

/* ---------------------------------------------------------------------------
 * prep_notes
 * ------------------------------------------------------------------------- */

export async function getPrepNote(userId: string, weekStart: Date): Promise<string> {
  const { data, error } = await supabase
    .from('prep_notes')
    .select('body')
    .eq('user_id', userId)
    .eq('week_start', toISODate(weekStart))
    .maybeSingle();
  if (error) throw error;
  return data?.body ?? '';
}

export async function savePrepNote(userId: string, weekStart: Date, body: string): Promise<void> {
  unwrap(
    await supabase
      .from('prep_notes')
      .upsert(
        { user_id: userId, week_start: toISODate(weekStart), body },
        { onConflict: 'user_id,week_start' },
      )
      .select('id'),
  );
}
