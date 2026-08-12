import { mapRecipeCard } from '@/features/recipes/api';
import type { Collection, RecipeCard } from '@/domain/types';
import { supabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/supabase/errors';

export async function listFavorites(userId: string): Promise<RecipeCard[]> {
  const rows = unwrap(
    await supabase
      .from('favorites')
      .select('recipe_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  );
  if (rows.length === 0) return [];

  const cards = unwrap(
    await supabase
      .from('recipe_cards')
      .select('*')
      .in(
        'id',
        rows.map((row) => row.recipe_id),
      ),
  );
  // Keep the "most recently favourited first" order the join lost.
  const order = new Map(rows.map((row, index) => [row.recipe_id, index]));
  return cards.map(mapRecipeCard).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function isFavorite(userId: string, recipeId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('favorites')
    .select('recipe_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('recipe_id', recipeId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function addFavorite(userId: string, recipeId: string): Promise<void> {
  unwrap(
    await supabase
      .from('favorites')
      .upsert({ user_id: userId, recipe_id: recipeId })
      .select('recipe_id'),
  );
}

export async function removeFavorite(userId: string, recipeId: string): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_id', recipeId);
  if (error) throw error;
}

export async function listCollections(userId: string): Promise<Collection[]> {
  return unwrap(
    await supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
  );
}

export async function createCollection(userId: string, name: string): Promise<Collection> {
  return unwrap(
    await supabase.from('collections').insert({ user_id: userId, name }).select('*').single(),
  );
}

export async function addToCollection(collectionId: string, recipeId: string): Promise<void> {
  unwrap(
    await supabase
      .from('collection_recipes')
      .upsert({ collection_id: collectionId, recipe_id: recipeId })
      .select('recipe_id'),
  );
}
