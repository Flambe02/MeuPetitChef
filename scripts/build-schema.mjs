/**
 * Boots a throwaway Postgres 17 (PGlite, WASM — no Docker) with the Supabase
 * stubs plus every migration applied, optionally seeded.
 *
 * Shared by `verify-schema.mjs` (assertions) and `gen-types.mjs` (typegen), so
 * both always look at exactly the same schema.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The parts of a Supabase project that live outside `public` and are provided
 * by the platform. Recreated here so migrations that reference them can run.
 */
export const SUPABASE_STUBS = /* sql */ `
  create schema if not exists auth;
  create schema if not exists storage;
  create schema if not exists extensions;

  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;

  create table if not exists auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  -- In production this reads the request JWT. Here it reads a session GUC so
  -- tests can impersonate a user via set_config('request.jwt.claim.sub', ...).
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  create or replace function auth.role() returns text
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
  $$;

  create table if not exists storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now()
  );

  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text,
    owner uuid,
    created_at timestamptz not null default now()
  );
  alter table storage.objects enable row level security;

  create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$
    select string_to_array(name, '/');
  $$;
`;

/**
 * @param {{ seed?: boolean, quiet?: boolean }} [options]
 * @returns {Promise<PGlite>}
 */
export async function buildSchema({ seed = true, quiet = false } = {}) {
  const log = quiet ? () => {} : (msg) => console.log(msg);
  const db = await PGlite.create({ extensions: { pg_trgm, unaccent, pgcrypto } });

  log('· stubbing Supabase-provided schemas');
  await db.exec(SUPABASE_STUBS);

  const migrationsDir = path.join(root, 'supabase', 'migrations');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error('no migrations found in supabase/migrations');

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    try {
      await db.exec(sql);
      log(`· applied ${file}`);
    } catch (error) {
      throw new Error(`migration failed: ${file}\n${error.message}`);
    }
  }

  if (seed) {
    const sql = await readFile(path.join(root, 'supabase', 'seed.sql'), 'utf8');
    try {
      await db.exec(sql);
      log('· applied seed.sql');
    } catch (error) {
      throw new Error(`seed failed\n${error.message}`);
    }
  }

  return db;
}
