-- ============================================================================
-- Meu Petit Chef — 07. Recipe import pipeline
--
-- The import flow replaces "screenshot -> ChatGPT -> retype". Extraction is
-- never trusted: a row sits in `needs_review` until a human accepts it, which
-- is what turns it into a real recipe.
-- ============================================================================

create table public.recipe_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source public.import_source not null,

  source_url text,
  raw_text text,
  -- Path inside the private `imports` storage bucket.
  raw_file_path text,

  status public.import_status not null default 'pending',
  -- Structured extraction result, shaped like the recipe payload the
  -- back-office form expects. Validated client-side with Zod before accepting.
  extracted jsonb,
  error_message text,
  model_used text,
  token_cost integer,

  -- Set once the import has been accepted and turned into a recipe.
  recipe_id uuid references public.recipes (id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint import_has_a_source
    check (source_url is not null or raw_text is not null or raw_file_path is not null),
  constraint accepted_import_has_recipe
    check (status <> 'accepted' or recipe_id is not null)
);

create index recipe_imports_user_idx on public.recipe_imports (user_id, created_at desc);
create index recipe_imports_status_idx on public.recipe_imports (status)
  where status in ('pending', 'extracting', 'needs_review');

create trigger recipe_imports_set_updated_at
  before update on public.recipe_imports
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Audit trail for AI-assisted adaptations. The concept document is explicit:
-- adaptations must be traceable and reversible. Every AI rewrite lands here
-- before it can touch a recipe.
-- ----------------------------------------------------------------------------
create table public.adaptation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  recipe_id uuid references public.recipes (id) on delete cascade,
  variant_id uuid references public.recipe_variants (id) on delete set null,

  kind text not null
    check (kind in ('substitution', 'scaling', 'equipment_swap', 'rewrite', 'nutrition')),
  prompt text,
  model_used text,
  payload jsonb not null default '{}'::jsonb,
  accepted boolean,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index adaptation_logs_recipe_idx on public.adaptation_logs (recipe_id, created_at desc);
create index adaptation_logs_user_idx on public.adaptation_logs (user_id, created_at desc);
