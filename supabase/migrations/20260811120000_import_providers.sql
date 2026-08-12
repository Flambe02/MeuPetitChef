-- ============================================================================
-- Meu Petit Chef — 13. Provider-aware recipe imports
--
-- Migration 07 built the import pipeline around "a user pastes something".
-- Cookomix and Cookidoo add a second shape: a *provider* is scraped or a saved
-- page is parsed, possibly by a back-office script with no user attached, and
-- the same URL must never be imported twice by accident.
--
-- Three things change, and nothing is replaced:
--
--   1. `provider` / `external_id` / `fingerprint` — identity, so deduplication
--      is a database constraint rather than a hope.
--   2. `raw_data` — the untouched provider payload, next to the existing
--      `extracted` column which already holds the *normalized* recipe. Keeping
--      both means a parser bug can be fixed and replayed without re-fetching.
--   3. `user_id` becomes nullable — a CLI import belongs to the catalogue, not
--      to a person. The owner policy already reads `user_id = auth.uid()`, and
--      `null = uid` is null, so those rows stay invisible to every end user.
--
-- The `import_status` enum is deliberately left alone. The brief's vocabulary
-- maps onto it without a new value: fetched/parsed/normalized are transient
-- states the CLI prints but never stores, `needs_review` is where an import
-- waits, `accepted` is approval, and a rejection is `failed` plus a reason in
-- `error_message`. Adding enum values here would also break `db:verify`, which
-- replays every migration inside a single implicit transaction.
-- ============================================================================

alter table public.recipe_imports
  alter column user_id drop not null,
  -- 'cookomix' | 'cookidoo' | ... Free text on purpose: a new provider is a
  -- file in src/lib/recipe-import/providers, not a migration.
  add column provider text,
  -- The provider's own id (Cookomix's `window.recipeId`, Cookidoo's `r59322`).
  add column external_id text,
  -- Verbatim provider payload — the JSON-LD node, the embedded state, the
  -- fields scraped off the DOM. Re-parsing reads this, not the network.
  add column raw_data jsonb,
  -- sha256(provider + normalized title + normalized ingredient names). Catches
  -- the same recipe arriving under two URLs, which `external_id` cannot.
  add column fingerprint text,
  -- Non-blocking validation findings, kept so review can be prioritised.
  add column warnings text[] not null default '{}';

comment on column public.recipe_imports.raw_data is
  'Untouched provider payload. `extracted` holds the normalized recipe; this holds what it was normalized from.';
comment on column public.recipe_imports.fingerprint is
  'sha256 of provider + normalized title + ingredient names. Duplicate detection when external_id is absent.';
comment on column public.recipe_imports.user_id is
  'Null for machine imports run by the back-office CLI. Those rows are service-role only.';

-- One row per (owner, provider, external id). Partial so the millions of
-- user-pasted imports with no provider are unaffected.
create unique index recipe_imports_provider_external_idx
  on public.recipe_imports (user_id, provider, external_id)
  where provider is not null and external_id is not null;

-- Machine imports share a single null owner, so they need their own guard.
create unique index recipe_imports_machine_external_idx
  on public.recipe_imports (provider, external_id)
  where user_id is null and provider is not null and external_id is not null;

create index recipe_imports_fingerprint_idx
  on public.recipe_imports (fingerprint)
  where fingerprint is not null;

-- ----------------------------------------------------------------------------
-- Editors curate the import queue, including the machine-owned rows that no
-- `user_id = auth.uid()` policy can ever match.
-- ----------------------------------------------------------------------------
create policy "recipe_imports: editors review" on public.recipe_imports
  for select using (public.is_editor());

create policy "recipe_imports: editors update" on public.recipe_imports
  for update using (public.is_editor()) with check (public.is_editor());

-- ----------------------------------------------------------------------------
-- Provenance on the recipe itself.
--
-- Without this, an imported recipe loses track of where it came from the moment
-- the import row is cleaned up — and attribution is not optional when the
-- content originates elsewhere.
-- ----------------------------------------------------------------------------
alter table public.recipes
  add column source_provider text,
  add column source_url text,
  -- Deliberately a URL and not a storage path: imported photos are *not*
  -- downloaded. The app ships its own images; this is for the review screen.
  add column source_image_url text,
  add column imported_at timestamptz;

comment on column public.recipes.source_image_url is
  'Original photo URL, kept for review only. Published recipes use hero_image_path in our own bucket.';

create index recipes_source_idx on public.recipes (source_provider, source_url)
  where source_provider is not null;
