import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChefMode, CookSession } from '@/domain/types';
import { useSession } from '@/features/auth/session-context';
import { keys } from '@/lib/query/keys';

import { finishSession, saveProgress, startOrResumeSession } from './api';

/**
 * The live cooking session for one recipe.
 *
 * A partial unique index guarantees at most one unfinished session per
 * (user, recipe), so this is a get-or-create rather than a plain insert: coming
 * back after locking the screen at step six lands back on step six instead of
 * restarting an eighteen-step recipe.
 *
 * The query cache is persisted to IndexedDB, so it is re-read on every launch:
 * it must therefore be kept truthful. `saveStep` writes the new step into the
 * cache as well as the database, and the query is refetched on mount so a
 * session advanced on another device still wins. The screen derives its step
 * rather than copying it into state, so a late response cannot pull the cook
 * backwards from a step they already reached.
 */
export function useCookSession(input: {
  recipeId: string | undefined;
  pathId: string | null;
  mode: ChefMode;
  servings: number;
}) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id;
  const enabled = Boolean(userId && input.recipeId);
  const sessionKey = keys.cook.session(userId ?? '', input.recipeId ?? '');

  const session = useQuery({
    queryKey: sessionKey,
    queryFn: () =>
      startOrResumeSession({
        userId: userId!,
        recipeId: input.recipeId!,
        pathId: input.pathId,
        mode: input.mode,
        servings: input.servings,
      }),
    enabled,
    // Deliberately not `Infinity`: the persisted cache would then keep serving
    // the step this session started at, forever.
    staleTime: 0,
  });

  const save = useMutation({
    mutationFn: (currentStep: number) => saveProgress(session.data!.id, currentStep),
    onMutate: (currentStep) => {
      client.setQueryData(sessionKey, (current: CookSession | undefined) =>
        current ? { ...current, current_step: currentStep } : current,
      );
    },
  });

  const finish = useMutation({
    mutationFn: () => finishSession(session.data!.id),
    onSuccess: () => {
      // The session is over; the next visit must start a fresh one.
      client.removeQueries({ queryKey: sessionKey });
      void client.invalidateQueries({ queryKey: keys.cook.all });
    },
  });

  return {
    session: session.data ?? null,
    /** Where the last visit left off, or 0. */
    resumeAt: session.data?.current_step ?? 0,
    isReady: session.isSuccess,
    saveStep: (step: number) => {
      if (session.data) save.mutate(step);
    },
    finish: () => {
      if (session.data) finish.mutate();
    },
  };
}
