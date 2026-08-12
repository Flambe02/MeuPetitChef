/**
 * The Supabase client the import scripts write with.
 *
 * Two keys are possible and the difference matters:
 *
 *   * `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS. Catalogue imports run with
 *     it, write drafts owned by nobody, and are visible only to editors. It is
 *     read from `.env.local` (gitignored) and must never be prefixed `VITE_`,
 *     or Vite would ship it to every browser.
 *   * the anon key — everything RLS allows an anonymous caller, which is
 *     nothing here. Refused with a readable message rather than a 401 later.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../src/lib/supabase/database.types.ts';
import { readEnv, requireEnv } from './env.ts';

export type ImportClient = SupabaseClient<Database, 'public'>;

export function createImportClient(): ImportClient {
  const url = readEnv('SUPABASE_URL') ?? requireEnv('VITE_SUPABASE_URL', 'a URL do projeto');
  const key = requireEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    'salvar receitas exige a service_role key (só no .env.local, nunca com prefixo VITE_)',
  );

  return createClient<Database, 'public'>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'meu-petit-chef-importer' } },
  });
}

/**
 * The profile a machine import is attributed to, when one is configured.
 *
 * Optional on purpose: `recipes.created_by` and `recipe_imports.user_id` are
 * both nullable since migration 13, so the CLI works out of the box and can
 * still be pointed at a real editor account when the team wants attribution.
 */
export function importUserId(): string | null {
  return readEnv('RECIPE_IMPORT_USER_ID');
}
