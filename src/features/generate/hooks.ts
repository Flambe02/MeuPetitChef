import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ChefMode, EquipmentType } from '@/domain/types';
import { useSession } from '@/features/auth/session-context';
import { keys } from '@/lib/query/keys';

import {
  addPathForEquipment,
  finishGeneration,
  generateRecipe,
  saveGeneratedDraft,
  startGeneration,
  type GeneratedRecipe,
} from './api';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The recipe conversation: ask, look, refine, then cook.
 *
 * Nothing is written to `recipes` until the cook accepts. Refining is cheap —
 * it is another model call against the same thread — while accepting creates a
 * durable draft, and creating a row per refinement would litter the book with
 * discarded attempts.
 */
export function useRecipeChat() {
  const { user } = useSession();
  const client = useQueryClient();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [recipe, setRecipe] = useState<GeneratedRecipe | null>(null);

  const ask = useMutation({
    mutationFn: async (input: {
      prompt: string;
      equipment: EquipmentType[];
      mode: ChefMode;
      servings: number;
    }) => {
      const history = turns;
      const generated = await generateRecipe({ ...input, turns: history });
      return { generated, prompt: input.prompt };
    },
    onSuccess: ({ generated, prompt }) => {
      setRecipe(generated);
      setTurns((current) => [
        ...current,
        { role: 'user', content: prompt },
        // The assistant turn carries the title only: replaying whole recipes
        // through the context window would cost more every round for no gain.
        { role: 'assistant', content: `Propus: ${generated.title}` },
      ]);
    },
  });

  /** Writes the accepted recipe as a private draft and returns its slug. */
  const accept = useMutation({
    mutationFn: async (input: { mode: ChefMode; equipment: EquipmentType[]; servings: number }) => {
      if (!recipe) throw new Error('Nenhuma receita para salvar.');
      const userId = user!.id;
      const generationId = await startGeneration(userId, {
        prompt: turns.find((turn) => turn.role === 'user')?.content ?? '',
        equipment: input.equipment,
        mode: input.mode,
        servings: input.servings,
        turns,
      });
      try {
        const draft = await saveGeneratedDraft(userId, recipe, input.mode);
        await finishGeneration(generationId, {
          recipeId: draft.id,
          turns,
          status: 'accepted',
        });
        return draft;
      } catch (error) {
        await finishGeneration(generationId, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    onSuccess: () => {
      // The draft is a readable recipe now: suggestions and the book both change.
      void client.invalidateQueries({ queryKey: keys.recipes.all });
    },
  });

  const reset = () => {
    setTurns([]);
    setRecipe(null);
    ask.reset();
    accept.reset();
  };

  return { turns, recipe, ask, accept, reset };
}

/**
 * "I do have a Thermomix" — adds a route to a recipe the caller authored.
 *
 * Invalidates the recipe namespace on success so the sheet, the pre-flight and
 * the path fit scores all pick the new route up without a reload.
 */
export function useAddPath() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: addPathForEquipment,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.recipes.all }),
  });
}
