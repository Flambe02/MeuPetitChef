import type { ChefMode, ShoppingAisle, ShoppingItem } from '@/domain/types';
import { supabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/supabase/errors';

export const AISLE_LABEL: Record<ShoppingAisle, string> = {
  hortifruti: 'Hortifrúti',
  acougue: 'Açougue',
  peixaria: 'Peixaria',
  mercearia: 'Mercearia',
  laticinios: 'Laticínios',
  padaria: 'Padaria',
  congelados: 'Congelados',
  bebidas: 'Bebidas',
  outros: 'Outros',
};

/** The aisle order a Brazilian supermarket is actually walked in. */
export const AISLE_ORDER: ShoppingAisle[] = [
  'hortifruti',
  'acougue',
  'peixaria',
  'laticinios',
  'padaria',
  'mercearia',
  'congelados',
  'bebidas',
  'outros',
];

export interface ShoppingSection {
  aisle: ShoppingAisle;
  label: string;
  items: ShoppingItem[];
}

/** The single open list, creating one on first use. */
export async function getOpenList(
  userId: string,
): Promise<{ id: string; sections: ShoppingSection[] }> {
  const existing = unwrap(
    await supabase
      .from('shopping_lists')
      .select('id')
      .eq('user_id', userId)
      .is('archived_at', null)
      .limit(1),
  );

  const listId =
    existing[0]?.id ??
    unwrap(await supabase.from('shopping_lists').insert({ user_id: userId }).select('id').single())
      .id;

  const items = unwrap(
    await supabase
      .from('shopping_items')
      .select('*')
      .eq('list_id', listId)
      .order('position', { ascending: true }),
  );

  const sections = AISLE_ORDER.map((aisle) => ({
    aisle,
    label: AISLE_LABEL[aisle],
    items: items.filter((item) => item.aisle === aisle),
  })).filter((section) => section.items.length > 0);

  return { id: listId, sections };
}

export async function addShoppingItem(
  listId: string,
  displayName: string,
  aisle: ShoppingAisle = 'outros',
): Promise<ShoppingItem> {
  return unwrap(
    await supabase
      .from('shopping_items')
      .insert({ list_id: listId, display_name: displayName.trim(), aisle })
      .select('*')
      .single(),
  );
}

export async function toggleShoppingItem(id: string, isChecked: boolean): Promise<void> {
  unwrap(
    await supabase
      .from('shopping_items')
      .update({ is_checked: isChecked })
      .eq('id', id)
      .select('id'),
  );
}

export async function removeShoppingItem(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_items').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Adds a whole recipe to the open list. The merging and pantry-skipping happen
 * in Postgres (`add_recipe_to_shopping_list`) so the phone never downloads the
 * full ingredient list just to diff it.
 */
export async function addRecipeToList(
  recipeId: string,
  servings?: number,
  mode: ChefMode = 'normal',
): Promise<string> {
  return unwrap(
    await supabase.rpc('add_recipe_to_shopping_list', {
      target_recipe: recipeId,
      target_servings: servings,
      target_mode: mode,
      skip_pantry: true,
    }),
  );
}

export async function archiveList(listId: string): Promise<void> {
  unwrap(
    await supabase
      .from('shopping_lists')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', listId)
      .select('id'),
  );
}
