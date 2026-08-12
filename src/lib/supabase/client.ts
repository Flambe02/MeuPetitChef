import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/config/env';

import type { Database } from './database.types';

export type AppSupabaseClient = SupabaseClient<Database, 'public'>;

/**
 * The single Supabase client for the browser.
 *
 * `persistSession` + `autoRefreshToken` keep the user logged in across PWA
 * launches, which matters here: someone opening the app from their home screen
 * mid-recipe should never land on a login form.
 */
export const supabase: AppSupabaseClient = createClient<Database, 'public'>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'mpc.auth',
    },
    global: {
      headers: { 'x-application-name': 'meu-petit-chef' },
    },
    db: { schema: 'public' },
  },
);

/** Public URL for an object in a public bucket. Returns null for a null path. */
export function storageUrl(
  bucket: 'recipe-images' | 'avatars',
  filePath: string | null,
): string | null {
  if (!filePath) return null;
  return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
}
