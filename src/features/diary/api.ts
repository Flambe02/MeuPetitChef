import type { DiaryEntry, MealSlot } from '@/domain/types';
import { toISODate } from '@/lib/format';
import { supabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/supabase/errors';

export const SLOT_LABEL: Record<MealSlot, string> = {
  cafe: 'Café da manhã',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  ceia: 'Ceia',
};

export interface DiaryDay {
  date: string;
  entries: DiaryEntry[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
}

export async function getDiaryDay(userId: string, date: Date): Promise<DiaryDay> {
  const isoDate = toISODate(date);
  const entries = unwrap(
    await supabase
      .from('diary_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('entry_date', isoDate)
      .order('logged_at', { ascending: true }),
  );

  const totals = entries.reduce(
    (acc, entry) => ({
      kcal: acc.kcal + (entry.kcal ?? 0) * entry.servings,
      protein: acc.protein + (entry.protein_g ?? 0) * entry.servings,
      carbs: acc.carbs + (entry.carbs_g ?? 0) * entry.servings,
      fat: acc.fat + (entry.fat_g ?? 0) * entry.servings,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return { date: isoDate, entries, totals };
}

/**
 * Logs a meal. Nutrition is copied in rather than referenced, so editing a
 * recipe later never rewrites what someone actually ate last Tuesday.
 */
export async function logMeal(
  userId: string,
  input: {
    date: Date;
    slot: MealSlot;
    title: string;
    recipeId?: string | null;
    servings?: number;
    kcal?: number | null;
    proteinG?: number | null;
    carbsG?: number | null;
    fatG?: number | null;
  },
): Promise<DiaryEntry> {
  return unwrap(
    await supabase
      .from('diary_entries')
      .insert({
        user_id: userId,
        entry_date: toISODate(input.date),
        slot: input.slot,
        title: input.title,
        recipe_id: input.recipeId ?? null,
        servings: input.servings ?? 1,
        kcal: input.kcal ?? null,
        protein_g: input.proteinG ?? null,
        carbs_g: input.carbsG ?? null,
        fat_g: input.fatG ?? null,
      })
      .select('*')
      .single(),
  );
}

export async function removeDiaryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('diary_entries').delete().eq('id', id);
  if (error) throw error;
}
