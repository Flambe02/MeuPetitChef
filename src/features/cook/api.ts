import type { ChefMode, CookSession } from '@/domain/types';
import { supabase } from '@/lib/supabase/client';
import { unwrap, unwrapMaybe } from '@/lib/supabase/errors';

/**
 * Resumes the live session for this recipe, or starts one.
 *
 * A partial unique index guarantees at most one unfinished session per
 * (user, recipe), so "open cook mode again" always lands back on the same step
 * rather than restarting the recipe.
 */
export async function startOrResumeSession(input: {
  userId: string;
  recipeId: string;
  pathId: string | null;
  mode: ChefMode;
  servings: number;
}): Promise<CookSession> {
  const existing = unwrapMaybe(
    await supabase
      .from('cook_sessions')
      .select('*')
      .eq('user_id', input.userId)
      .eq('recipe_id', input.recipeId)
      .is('finished_at', null)
      .is('abandoned_at', null)
      .maybeSingle(),
  );
  if (existing) return existing;

  return unwrap(
    await supabase
      .from('cook_sessions')
      .insert({
        user_id: input.userId,
        recipe_id: input.recipeId,
        path_id: input.pathId,
        mode: input.mode,
        servings: input.servings,
      })
      .select('*')
      .single(),
  );
}

export async function saveProgress(sessionId: string, currentStep: number): Promise<void> {
  unwrap(
    await supabase
      .from('cook_sessions')
      .update({ current_step: currentStep })
      .eq('id', sessionId)
      .select('id'),
  );
}

export async function finishSession(sessionId: string): Promise<void> {
  unwrap(
    await supabase
      .from('cook_sessions')
      .update({ finished_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select('id'),
  );
}

export async function abandonSession(sessionId: string): Promise<void> {
  unwrap(
    await supabase
      .from('cook_sessions')
      .update({ abandoned_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select('id'),
  );
}

export async function listRecentSessions(userId: string, limit = 20): Promise<CookSession[]> {
  return unwrap(
    await supabase
      .from('cook_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit),
  );
}
