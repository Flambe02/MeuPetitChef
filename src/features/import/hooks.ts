import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session-context';
import { keys } from '@/lib/query/keys';

import {
  analyzeImport,
  checkDuplicate,
  listImports,
  saveImport,
  type AnalyzeInput,
  type DuplicateMatch,
  type ImportOutcome,
} from './api';

/** The caller's import queue. */
export function useImports() {
  const { user } = useSession();
  const userId = user?.id;
  return useQuery({
    queryKey: keys.imports.list(userId ?? ''),
    queryFn: () => listImports(userId!),
    enabled: Boolean(userId),
  });
}

export interface AnalyzedImport {
  outcome: ImportOutcome;
  duplicate: DuplicateMatch | null;
}

/**
 * Analyse, then look for an earlier import of the same recipe.
 *
 * The duplicate check runs here rather than at save time so the review screen
 * can say "you already imported this" *before* the user reads the whole recipe
 * and presses the button.
 */
export function useAnalyzeImport() {
  return useMutation({
    mutationFn: async (input: AnalyzeInput): Promise<AnalyzedImport> => {
      const outcome = await analyzeImport(input);
      return { outcome, duplicate: await checkDuplicate(outcome) };
    },
  });
}

export function useSaveImport() {
  const { user } = useSession();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (outcome: ImportOutcome) => saveImport(user!.id, outcome),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.imports.all });
      // The new draft is the caller's own recipe, so every recipe list they can
      // see may now contain it.
      await client.invalidateQueries({ queryKey: keys.recipes.all });
    },
  });
}
