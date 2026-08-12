import type { EquipmentType, PreferenceKind, Profile, ProfileEquipment } from '@/domain/types';
import { supabase } from '@/lib/supabase/client';
import { unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import type { TablesUpdate } from '@/lib/supabase/database.types';

export async function getProfile(userId: string): Promise<Profile | null> {
  return unwrapMaybe(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
}

export async function updateProfile(
  userId: string,
  patch: TablesUpdate<'profiles'>,
): Promise<Profile> {
  return unwrap(
    await supabase.from('profiles').update(patch).eq('id', userId).select('*').single(),
  );
}

export async function getEquipment(userId: string): Promise<ProfileEquipment[]> {
  return unwrap(
    await supabase
      .from('profile_equipment')
      .select('*')
      .eq('user_id', userId)
      .order('equipment', { ascending: true }),
  );
}

/**
 * Replaces the user's kitchen wholesale. Onboarding is a single "save" of a
 * checkbox grid, so a diff-based update would be more code for no benefit.
 */
export interface EquipmentSelection {
  equipment: EquipmentType;
  /** Free-form model or capacity: "6 litros", "TM6". */
  spec?: string | null;
  /** Bumps this appliance's fit score when several routes are possible. */
  isPreferred?: boolean;
}

export async function setEquipment(userId: string, selection: EquipmentSelection[]): Promise<void> {
  unwrap(await supabase.from('profile_equipment').delete().eq('user_id', userId).select('id'));
  if (selection.length === 0) return;
  unwrap(
    await supabase
      .from('profile_equipment')
      .insert(
        selection.map((item) => ({
          user_id: userId,
          equipment: item.equipment,
          spec: item.spec ?? null,
          is_preferred: item.isPreferred ?? false,
        })),
      )
      .select('id'),
  );
}

export async function getPreferences(userId: string) {
  return unwrap(await supabase.from('profile_preferences').select('*').eq('user_id', userId));
}

export async function setPreferences(
  userId: string,
  kind: PreferenceKind,
  values: string[],
): Promise<void> {
  unwrap(
    await supabase
      .from('profile_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('kind', kind)
      .select('id'),
  );
  if (values.length === 0) return;
  unwrap(
    await supabase
      .from('profile_preferences')
      .insert(values.map((value) => ({ user_id: userId, kind, value })))
      .select('id'),
  );
}

export async function completeOnboarding(userId: string): Promise<Profile> {
  return updateProfile(userId, { onboarding_completed_at: new Date().toISOString() });
}
