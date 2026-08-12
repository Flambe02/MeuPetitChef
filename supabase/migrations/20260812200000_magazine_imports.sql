-- ============================================================================
-- Meu Petit Chef — 17. Importing a cooking magazine, page by page
--
-- A magazine is not a recipe, which is why `recipe_imports` is not stretched to
-- hold one. That table answers "one source, one recipe": it carries a provider,
-- an external id and a single `extracted` payload. A hundred-page issue of Régal
-- is one file, N pages of which are advertising, and M recipes spread across
-- them — sometimes two on a page, sometimes one over two pages. Those are
-- different cardinalities, and forcing them into one row would mean either a
-- JSONB blob nobody can query or a hundred rows pretending to be imports.
--
-- Four tables, each with one job:
--
--   magazine_imports        the file, its identity, and where the run got to
--   magazine_import_pages   one row per page — THIS is what makes resuming work
--   magazine_import_items   one row per recipe found, source and adaptation
--   magazine_import_logs    what happened, in order, for the admin drawer
--
-- Plus `ai_usage_events`, which is deliberately *not* magazine-specific: the
-- adaptation and generation passes should land there too, and a table named
-- `magazine_ai_costs` would have had to be renamed the first time they did.
--
-- Everything here is admin-only. `public.is_admin()` has existed since migration
-- 01 and had no caller; this is it. Hiding the screen is not access control —
-- PostgREST is a public endpoint, and the policies below are what actually stop
-- a signed-in stranger from POSTing an import.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Vocabulary
--
-- New enum *types* (not new values on existing ones) so `db:verify` keeps
-- working: `alter type ... add value` cannot be used in the same transaction
-- that adds it, and every migration replays inside one.
-- ----------------------------------------------------------------------------

-- The run's own lifecycle, as the brief's §27 names it.
create type public.magazine_import_status as enum (
  'uploaded',
  'processing',
  'extracting',
  'review_required',
  'ready',
  'completed',
  'failed'
);

-- What a page turned out to be. `recipe_index` is the table of contents that
-- lists recipes with their page numbers — the single most valuable page in the
-- file, because it turns "classify 100 pages" into "read 30".
create type public.magazine_page_kind as enum (
  'cover',
  'advertisement',
  'editorial',
  'index',
  'article',
  'recipe',
  'recipe_index',
  'unknown'
);

-- One recipe's journey. `detected` comes from the index or a first pass;
-- `extracted` means the structured read succeeded; `imported` means it became a
-- row in `recipes`. Nothing skips `approved`: an extraction is never trusted.
create type public.magazine_item_status as enum (
  'detected',
  'extracted',
  'review',
  'approved',
  'imported',
  'ignored',
  'failed'
);

-- ----------------------------------------------------------------------------
-- The import
-- ----------------------------------------------------------------------------
create table public.magazine_imports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,

  -- Free text rather than an enum, for the same reason `recipe_imports.provider`
  -- is: the second source (Cookomix, Cookidoo, a scanned book) should be a file
  -- in the code, not a migration.
  source_type text not null default 'magazine_pdf',

  -- Identity, as read off the cover and then corrected by hand.
  publication text,
  issue text,
  -- A magazine issue is a month, not a day. Stored as the partial date it
  -- actually is instead of being padded to a lie.
  publication_date text
    constraint magazine_publication_date_is_year_or_month
    check (publication_date is null or publication_date ~ '^\d{4}(-\d{2})?$'),
  language text not null default 'fr',
  country text,

  -- Inside the private `imports` bucket: {uid}/magazines/{import_id}/original.pdf
  file_path text not null,
  file_name text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  cover_image_path text,
  page_count integer check (page_count is null or page_count > 0),

  status public.magazine_import_status not null default 'uploaded',
  -- Which pipeline step is running, for the progress bar. Free text because the
  -- steps are a code concern and renaming one should not be a migration.
  stage text,
  pages_analyzed integer not null default 0 check (pages_analyzed >= 0),
  recipe_count integer not null default 0 check (recipe_count >= 0),

  -- Detected-but-unconfirmed cover data, the recipe index as read, thresholds
  -- in force for this run. Shapeless on purpose; nothing queries inside it.
  metadata jsonb not null default '{}'::jsonb,
  error_message text,

  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint magazine_import_failed_says_why
    check (status <> 'failed' or error_message is not null)
);

comment on table public.magazine_imports is
  'One uploaded magazine. Admin-only. The PDF itself stays in the private imports bucket and is never served publicly.';
comment on column public.magazine_imports.metadata is
  'Cover data as detected, the recipe index as read, and the confidence thresholds this run used. Never queried inside.';

create index magazine_imports_owner_idx
  on public.magazine_imports (created_by, created_at desc);
create index magazine_imports_status_idx
  on public.magazine_imports (status)
  where status in ('uploaded', 'processing', 'extracting', 'review_required');

create trigger magazine_imports_set_updated_at
  before update on public.magazine_imports
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- The pages
--
-- This table is the resume mechanism, and the reason it is a table rather than
-- a counter on the import. "Stopped at page 64" is not enough to restart well:
-- page 12 may have been classified as an advert and skipped, page 58 may have
-- failed its extraction and deserve a retry while page 59 does not. One row per
-- page, each carrying its own status, makes "carry on" a `where status =
-- 'pending'` rather than a guess.
-- ----------------------------------------------------------------------------
create table public.magazine_import_pages (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.magazine_imports (id) on delete cascade,
  page_number integer not null check (page_number > 0),

  kind public.magazine_page_kind not null default 'unknown',
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  -- How the classification was reached. 'text' costs nothing and handles most
  -- pages; 'vision' is the expensive fallback. Kept so the ratio can be watched.
  classified_by text
    check (classified_by is null or classified_by in ('text', 'vision', 'index', 'manual')),

  -- The embedded text layer, trimmed. Scanned magazines have none, which is
  -- itself a signal: no text plus a full-page image is usually an advert.
  text_excerpt text,
  -- Rendered page image, in the private bucket. Written only for pages that
  -- needed one, because a hundred JPEGs per issue is real storage.
  image_path text,

  status text not null default 'pending'
    check (status in ('pending', 'classified', 'extracted', 'skipped', 'failed')),
  error_message text,
  attempts smallint not null default 0 check (attempts >= 0),
  analyzed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (import_id, page_number)
);

comment on table public.magazine_import_pages is
  'One row per page. The pipeline reads its next unit of work from here, which is what makes an interrupted run resume instead of restarting.';

create index magazine_import_pages_todo_idx
  on public.magazine_import_pages (import_id, page_number)
  where status in ('pending', 'failed');
create index magazine_import_pages_recipe_idx
  on public.magazine_import_pages (import_id, page_number)
  where kind in ('recipe', 'recipe_index');

create trigger magazine_import_pages_set_updated_at
  before update on public.magazine_import_pages
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- The recipes found
--
-- Two payloads, side by side, and that is the whole design. `source_data` is
-- what the magazine says, kept verbatim and never overwritten; `transformed_data`
-- is the Meu Petit Chef version. Keeping both is what lets the review screen put
-- them next to each other, and what lets a re-translation be re-run without
-- going back to the PDF.
-- ----------------------------------------------------------------------------
create table public.magazine_import_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.magazine_imports (id) on delete cascade,

  title text,
  -- A recipe can start on 58 and finish on 59, so this is an array and not a
  -- page number. Ordered as read.
  source_pages integer[] not null default '{}',
  -- Where on the page, when several recipes share one ("first of two").
  block_index smallint not null default 0 check (block_index >= 0),

  -- The magazine's recipe, as read. Shape: MagazineRecipe.
  source_data jsonb,
  -- The adapted recipe. Shape: CanonicalRecipe — the same one the Cookomix and
  -- Cookidoo importers produce, so `saveImportedRecipe()` writes it unchanged.
  transformed_data jsonb,
  -- { overall, title, ingredients, steps } — per-field, because "0.72 overall"
  -- does not tell a reviewer where to look.
  confidence jsonb not null default '{}'::jsonb,

  status public.magazine_item_status not null default 'detected',
  needs_review boolean not null default true,
  error_message text,

  -- A crop of the magazine page, in the private bucket. Provenance and review
  -- only: it is somebody else's photograph and must never become a recipe's
  -- public image. `app_image_url` is the independent slot for a picture we own
  -- or generate ourselves, and nothing fills it automatically.
  source_image_path text,
  app_image_url text,

  -- sha256(title + ingredient names), as elsewhere in the import pipeline.
  fingerprint text,
  recipe_id uuid references public.recipes (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint magazine_item_imported_has_recipe
    check (status <> 'imported' or recipe_id is not null)
);

comment on table public.magazine_import_items is
  'One recipe found in a magazine. source_data is the magazine''s version, transformed_data ours; neither overwrites the other.';
comment on column public.magazine_import_items.source_image_path is
  'A crop of the magazine page. Provenance and review only — never published, never copied into recipes.hero_image_path.';
comment on column public.magazine_import_items.app_image_url is
  'A picture we own or generated. Independent of source_image_path and never filled automatically.';

create index magazine_import_items_import_idx
  on public.magazine_import_items (import_id, status);
create index magazine_import_items_fingerprint_idx
  on public.magazine_import_items (fingerprint)
  where fingerprint is not null;

create trigger magazine_import_items_set_updated_at
  before update on public.magazine_import_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- The log
--
-- "12:04 index detected on page 98 · 87 potential recipes". Cheap to write and
-- the only thing that makes a run that went wrong explicable after the fact.
-- ----------------------------------------------------------------------------
create table public.magazine_import_logs (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.magazine_imports (id) on delete cascade,
  level text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index magazine_import_logs_import_idx
  on public.magazine_import_logs (import_id, created_at);

-- ----------------------------------------------------------------------------
-- What the AI cost
--
-- Not magazine-specific, on purpose. `adapt-recipe` and `generate-recipe` spend
-- tokens too and should write here; a table called `magazine_ai_costs` would
-- have needed renaming the first time one did. `magazine_import_id` is therefore
-- nullable rather than the primary link.
--
-- The cost is stored as computed at call time rather than derived on read: model
-- prices change, and a report that silently reprices last month's runs is worse
-- than no report.
-- ----------------------------------------------------------------------------
create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,

  provider text not null,
  model text not null,
  -- 'classify_page', 'read_index', 'extract_recipe', 'translate', ...
  operation text not null,

  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(10, 6) not null default 0 check (estimated_cost_usd >= 0),

  magazine_import_id uuid references public.magazine_imports (id) on delete cascade,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ai_usage_events is
  'One row per model call. Deliberately generic: every AI pass in the app should write here, not only the magazine importer.';
comment on column public.ai_usage_events.estimated_cost_usd is
  'Priced at call time. Model prices change, and re-deriving old runs from today''s prices would quietly rewrite history.';

create index ai_usage_events_import_idx
  on public.ai_usage_events (magazine_import_id, created_at)
  where magazine_import_id is not null;
create index ai_usage_events_model_idx
  on public.ai_usage_events (model, created_at desc);

-- ----------------------------------------------------------------------------
-- Row Level Security — admin, and nobody else
--
-- Not "the owner": an editor who uploaded a magazine last month should not keep
-- private access to a back-office queue after being demoted, and a second admin
-- must be able to finish somebody else's review. `is_admin()` is SECURITY
-- DEFINER and reads `profiles.role`, so this does not recurse.
-- ----------------------------------------------------------------------------
alter table public.magazine_imports       enable row level security;
alter table public.magazine_import_pages  enable row level security;
alter table public.magazine_import_items  enable row level security;
alter table public.magazine_import_logs   enable row level security;
alter table public.ai_usage_events        enable row level security;

create policy "magazine_imports: admins only" on public.magazine_imports
  for all using (public.is_admin()) with check (public.is_admin());

create policy "magazine_import_pages: admins only" on public.magazine_import_pages
  for all using (public.is_admin()) with check (public.is_admin());

create policy "magazine_import_items: admins only" on public.magazine_import_items
  for all using (public.is_admin()) with check (public.is_admin());

create policy "magazine_import_logs: admins only" on public.magazine_import_logs
  for all using (public.is_admin()) with check (public.is_admin());

create policy "ai_usage_events: admins read" on public.ai_usage_events
  for select using (public.is_admin());
-- Any signed-in user can *record* what they spent — the adaptation pass runs
-- from the import screen — but only an admin can read the ledger back.
create policy "ai_usage_events: insert own" on public.ai_usage_events
  for insert with check (created_by = (select auth.uid()) or public.is_admin());

-- ----------------------------------------------------------------------------
-- Storage
--
-- No new bucket. `imports` (migration 10) is already private, already limited to
-- 20 MB, already accepts application/pdf, and its policies already scope writes
-- to `{uid}/`. A magazine lives at:
--
--   imports/{uid}/magazines/{import_id}/original.pdf
--   imports/{uid}/magazines/{import_id}/pages/page-001.jpg
--   imports/{uid}/magazines/{import_id}/items/{item_id}/source.jpg
--
-- A second bucket would have meant a second, near-identical policy set to keep
-- in step — and the difference between them would be discovered the day one of
-- the two was wrong.
-- ----------------------------------------------------------------------------
