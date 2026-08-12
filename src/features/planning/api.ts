import type { ChefMode, MealPlanEntry, MealSlot } from '@/domain/types';
import { toISODate } from '@/lib/format';
import { supabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/supabase/errors';

/** Monday of the week containing `date`. The planner is Monday-first. */
export function startOfWeek(date: Date = new Date()): Date {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7; // 0 = Monday
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
}

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

export async function setPlanEntry(
  userId: string,
  input: {
    date: Date;
    slot: MealSlot;
    recipeId?: string | null;
    customTitle?: string | null;
    servings?: number;
    mode?: ChefMode | null;
  },
): Promise<MealPlanEntry> {
  return unwrap(
    await supabase
      .from('meal_plan_entries')
      .upsert(
        {
          user_id: userId,
          plan_date: toISODate(input.date),
          slot: input.slot,
          recipe_id: input.recipeId ?? null,
          custom_title: input.customTitle ?? null,
          servings: input.servings ?? 2,
          mode: input.mode ?? null,
          source: 'manual',
        },
        { onConflict: 'user_id,plan_date,slot' },
      )
      .select('*')
      .single(),
  );
}

export async function clearPlanEntry(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id);
  if (error) throw error;
}

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
