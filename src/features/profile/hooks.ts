import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session-context';
import { keys } from '@/lib/query/keys';
import type { TablesUpdate } from '@/lib/supabase/database.types';

import type { ChefMode, EquipmentType, PreferenceKind } from '@/domain/types';

import {
  completeOnboarding,
  getEquipment,
  getPreferences,
  getProfile,
  setEquipment,
  setPreferences,
  updateProfile,
  type EquipmentSelection,
} from './api';

export function useProfile() {
  const { user } = useSession();
  const userId = user?.id;
  return useQuery({
    queryKey: keys.profile.current(userId ?? ''),
    queryFn: () => getProfile(userId!),
    enabled: Boolean(userId),
  });
}

export function useEquipment() {
  const { user } = useSession();
  const userId = user?.id;
  return useQuery({
    queryKey: keys.profile.equipment(userId ?? ''),
    queryFn: () => getEquipment(userId!),
    enabled: Boolean(userId),
  });
}

export function usePreferences() {
  const { user } = useSession();
  const userId = user?.id;
  return useQuery({
    queryKey: keys.profile.preferences(userId ?? ''),
    queryFn: () => getPreferences(userId!),
    enabled: Boolean(userId),
  });
}

export function useUpdateProfile() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: TablesUpdate<'profiles'>) => updateProfile(user!.id, patch),
    onSuccess: (profile) => {
      client.setQueryData(keys.profile.current(profile.id), profile);
      // Chef mode and equipment change what every recipe query returns.
      void client.invalidateQueries({ queryKey: keys.recipes.all });
    },
  });
}

/**
 * Replaces the kitchen wholesale.
 *
 * Equipment changes what every recipe query returns — the suggestion ranking,
 * the path fit scores, the "Falta: Forno" warnings — so the whole recipe
 * namespace goes with it.
 */
export function useSetEquipment() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (selection: EquipmentSelection[]) => setEquipment(user!.id, selection),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profile.all });
      void client.invalidateQueries({ queryKey: keys.recipes.all });
    },
  });
}

/** Replaces one kind of preference chip (cuisines, restrictions, …). */
export function useSetPreferences() {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, values }: { kind: PreferenceKind; values: string[] }) =>
      setPreferences(user!.id, kind, values),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profile.all });
      void client.invalidateQueries({ queryKey: keys.recipes.all });
    },
  });
}

/**
 * Saves the kitchen, then stamps the onboarding as done — in that order, and in
 * one mutation, because the guard lets the user out of onboarding the instant
 * `onboarding_completed_at` lands. Stamping first would let them reach the app
 * with an empty kitchen if the equipment write then failed.
 */
export function useCompleteOnboarding() {
  const { user } = useSession();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: { chefMode: ChefMode; equipment: EquipmentType[] }) => {
      const userId = user!.id;
      await updateProfile(userId, { chef_mode: input.chefMode });
      await setEquipment(
        userId,
        input.equipment.map((equipment) => ({ equipment })),
      );
      return completeOnboarding(userId);
    },
    onSuccess: (profile) => {
      client.setQueryData(keys.profile.current(profile.id), profile);
      void client.invalidateQueries({ queryKey: keys.profile.all });
      void client.invalidateQueries({ queryKey: keys.recipes.all });
    },
  });
}
