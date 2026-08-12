import type { PantryItem } from '@/domain/types';
import { supabase } from '@/lib/supabase/client';
import { unwrap } from '@/lib/supabase/errors';

export async function listPantry(userId: string): Promise<PantryItem[]> {
  return unwrap(
    await supabase
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  );
}

export async function addPantryItem(userId: string, displayName: string): Promise<PantryItem> {
  return unwrap(
    await supabase
      .from('pantry_items')
      // The unique (user_id, display_name) index makes re-adding a no-op.
      .upsert(
        { user_id: userId, display_name: displayName.trim() },
        { onConflict: 'user_id,display_name' },
      )
      .select('*')
      .single(),
  );
}

export async function removePantryItem(id: string): Promise<void> {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id);
  if (error) throw error;
}
