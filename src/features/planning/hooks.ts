import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChefMode, MealPlanGenerationMode, MealSlot } from '@/domain/types';
import { useSession } from '@/features/auth/session-context';
import { listRecentSessions } from '@/features/cook/api';
import { getEquipment, getPreferences, getProfile } from '@/features/profile/api';
import { searchRecipes } from '@/features/recipes/api';
import { addRecipeToList } from '@/features/shopping/api';
import { toISODate } from '@/lib/format';
import { weekRange } from '@/lib/planning/dates';
import { generateMealSuggestion, generateWeeklyMealPlan, labelSuggestions } from '@/lib/planning/engine';
import { recipeEntriesForShoppingList } from '@/lib/planning/shopping';
import type { GenerationContext, GenerationPreferences, PlannedEntry } from '@/lib/planning/types';
import { keys } from '@/lib/query/keys';

import {
  bulkUpsertEntries,
  clearPlanEntry,
  getMealPlan,
  getPrepNote,
  listWeekPlan,
  markEntryCooked,
  markEntryPlanned,
  moveEntry,
  resolvePlannedEntries,
  saveMealPlan,
  savePrepNote,
  setCustomEntry,
  setEatingOutEntry,
  setEntryLocked,
  setEntryServings,
  setLeftoverEntry,
  setRecipeEntry,
  setSkippedEntry,
} from './api';

/** The whole week: every slot, its recipe resolved, and the week's own header row. */
export function useWeekPlan(weekStart: Date) {
  const { user } = useSession();
  const userId = user?.id;
  const weekKey = toISODate(weekStart);

  const entries = useQuery({
    queryKey: keys.plan.week(userId ?? '', weekKey),
    queryFn: async (): Promise<PlannedEntry[]> => {
      const rows = await listWeekPlan(userId!, weekStart);
      return resolvePlannedEntries(rows);
    },
    enabled: Boolean(userId),
  });

  const mealPlan = useQuery({
    queryKey: keys.plan.meta(userId ?? '', weekKey),
    queryFn: () => getMealPlan(userId!, weekStart),
    enabled: Boolean(userId),
  });

  return { entries, mealPlan };
}

export function usePrepNote(weekStart: Date) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id;
  const weekKey = toISODate(weekStart);
  const queryKey = [...keys.plan.meta(userId ?? '', weekKey), 'prep-note'] as const;

  const note = useQuery({
    queryKey,
    queryFn: () => getPrepNote(userId!, weekStart),
    enabled: Boolean(userId),
  });

  const save = useMutation({
    mutationFn: (body: string) => savePrepNote(userId!, weekStart, body),
    onSuccess: (_void, body) => client.setQueryData(queryKey, body),
  });

  return { note, save };
}

function invalidateWeek(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: keys.plan.all });
}

/* ---------------------------------------------------------------------------
 * One-slot mutations — every action the "⋯" menu and the empty-slot sheet
 * offer. Each just invalidates the whole `plan` namespace on success: a week
 * is a few dozen rows at most, and re-fetching all of it is simpler and just
 * as fast as tracking which single slot changed.
 * ------------------------------------------------------------------------- */

export function useSetRecipeEntry() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      date: Date;
      slot: MealSlot;
      recipeId: string;
      servings?: number;
      mode?: ChefMode | null;
    }) => setRecipeEntry(user!.id, input),
    onSuccess: () => invalidateWeek(client),
  });
}

export function useSetCustomEntry() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: Date; slot: MealSlot; title: string; servings?: number }) =>
      setCustomEntry(user!.id, input),
    onSuccess: () => invalidateWeek(client),
  });
}

export function useSetLeftoverEntry() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      date: Date;
      slot: MealSlot;
      parentEntryId: string;
      recipeId: string | null;
      servings?: number;
    }) => setLeftoverEntry(user!.id, input),
    onSuccess: () => invalidateWeek(client),
  });
}

export function useSetEatingOutEntry() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: Date; slot: MealSlot; title?: string | null }) =>
      setEatingOutEntry(user!.id, input),
    onSuccess: () => invalidateWeek(client),
  });
}

export function useSetSkippedEntry() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: Date; slot: MealSlot }) => setSkippedEntry(user!.id, input),
    onSuccess: () => invalidateWeek(client),
  });
}

export function useClearEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clearPlanEntry(id),
    onSuccess: () => invalidateWeek(client),
  });
}

export function useSetEntryLocked() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; locked: boolean }) => setEntryLocked(input.id, input.locked),
    onSuccess: () => invalidateWeek(client),
  });
}

/** "Já comi" and its undo. */
export function useSetEntryCooked() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; cooked: boolean }) =>
      input.cooked ? markEntryCooked(input.id) : markEntryPlanned(input.id),
    onSuccess: () => invalidateWeek(client),
  });
}

export function useMoveEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; date: Date; slot: MealSlot }) =>
      moveEntry(input.id, input.date, input.slot),
    onSuccess: () => invalidateWeek(client),
  });
}

export function useSetEntryServings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; servings: number }) => setEntryServings(input.id, input.servings),
    onSuccess: () => invalidateWeek(client),
  });
}

/* ---------------------------------------------------------------------------
 * The generator — "Montar minha semana", "Melhorar minha semana" and
 * "Sugerir para mim" all reduce to the same context assembly and the same
 * engine call; only which entries count as fixed, and whether the result
 * gets written, differ.
 * ------------------------------------------------------------------------- */

interface GenerationRunInput {
  weekStart: Date;
  mode: ChefMode;
  generationMode: MealPlanGenerationMode;
  preferences: GenerationPreferences;
}

async function buildGenerationContext(
  userId: string,
  input: GenerationRunInput,
  fixedPolicy: 'locked-only' | 'locked-and-manual' | 'all',
  exclude?: { date: Date; slot: MealSlot },
): Promise<GenerationContext> {
  const [profile, equipment, preferences, candidates, sessions, existingRows] = await Promise.all([
    getProfile(userId),
    getEquipment(userId),
    getPreferences(userId),
    searchRecipes({ mode: input.mode }),
    listRecentSessions(userId, 50),
    listWeekPlan(userId, input.weekStart),
  ]);

  const existing = await resolvePlannedEntries(existingRows);
  const excludeKey = exclude ? `${toISODate(exclude.date)}:${exclude.slot}` : null;

  const fixedEntries = existing.filter((planned) => {
    const key = `${planned.entry.plan_date}:${planned.entry.slot}`;
    if (excludeKey && key === excludeKey) return false;
    if (fixedPolicy === 'all') return true;
    if (fixedPolicy === 'locked-only') return planned.entry.locked;
    return planned.entry.locked || planned.entry.source === 'manual';
  });

  return {
    week: weekRange(input.weekStart),
    mode: input.mode,
    generationMode: input.generationMode,
    preferences: input.preferences,
    profile,
    ownedEquipment: equipment.map((item) => item.equipment),
    preferenceValues: preferences
      .filter((entry) => entry.kind === 'cuisine' || entry.kind === 'style')
      .map((entry) => entry.value),
    candidates,
    fixedEntries,
    recentlyCooked: sessions
      .filter((session) => session.finished_at !== null)
      .map((session) => ({ recipeId: session.recipe_id, finishedAt: session.finished_at! })),
  };
}

/** "✨ Montar minha semana" — fills every non-locked slot from scratch. */
export function useGenerateWeek() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerationRunInput) => {
      if (!user) throw new Error('Sessão expirada.');
      const context = await buildGenerationContext(user.id, input, 'locked-only');
      const result = generateWeeklyMealPlan(context);
      await bulkUpsertEntries(user.id, result.entries, input.mode);
      const range = weekRange(input.weekStart);
      await saveMealPlan(user.id, range.start, range.end, input.generationMode, input.preferences);
      return result;
    },
    onSuccess: () => invalidateWeek(client),
  });
}

/** "✨ Melhorar minha semana" — keeps every locked or manually-chosen slot, refills the rest. */
export function useImproveWeek() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerationRunInput) => {
      if (!user) throw new Error('Sessão expirada.');
      const context = await buildGenerationContext(user.id, input, 'locked-and-manual');
      const result = generateWeeklyMealPlan(context);
      await bulkUpsertEntries(user.id, result.entries, input.mode);
      return {
        ...result,
        keptCount: context.fixedEntries.length,
        filledCount: result.entries.length,
      };
    },
    onSuccess: () => invalidateWeek(client),
  });
}

/** "Sugerir para mim" — up to three alternatives for one slot, nothing written until the person picks one. */
export function useSuggestForSlot() {
  const { user } = useSession();
  return useMutation({
    mutationFn: async (
      input: GenerationRunInput & { date: Date; slot: MealSlot; excludeRecipeId?: string },
    ) => {
      if (!user) throw new Error('Sessão expirada.');
      const context = await buildGenerationContext(user.id, input, 'all', {
        date: input.date,
        slot: input.slot,
      });
      const alternatives = generateMealSuggestion(context, input.excludeRecipeId, 3);
      return labelSuggestions(alternatives, input.mode);
    },
  });
}

/**
 * "🛒 Criar lista de compras" — every `recipe` entry in the week, pushed
 * through the same `add_recipe_to_shopping_list` RPC every other importer
 * uses. Sequential on purpose: the RPC reads-then-writes the one open list,
 * and concurrent calls from the same user racing to create it is exactly the
 * kind of bug a `for await` avoids.
 */
export function useCreateShoppingListFromWeek() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { weekStart: Date; mode: ChefMode }) => {
      if (!user) throw new Error('Sessão expirada.');
      const rows = await listWeekPlan(user.id, input.weekStart);
      const recipeEntries = recipeEntriesForShoppingList(rows);
      for (const row of recipeEntries) {
        await addRecipeToList(row.recipe_id!, row.servings, row.mode ?? input.mode);
      }
      return recipeEntries.length;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.shopping.all }),
  });
}
