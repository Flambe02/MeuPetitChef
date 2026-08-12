-- ============================================================================
-- Meu Petit Chef — 06. Pantry, meal plan, shopping list, food diary
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Despensa — what the user has at home right now. Drives "cozinhe com o que
-- você tem" suggestions.
-- ----------------------------------------------------------------------------
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  display_name text not null,
  quantity numeric(9, 3) check (quantity >= 0),
  unit text,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, display_name)
);

create index pantry_items_user_idx on public.pantry_items (user_id);
create index pantry_items_expiry_idx on public.pantry_items (user_id, expires_on)
  where expires_on is not null;

create trigger pantry_items_set_updated_at
  before update on public.pantry_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Meal plan — one recipe per (day, slot).
-- ----------------------------------------------------------------------------
create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_date date not null,
  slot public.meal_slot not null,
  recipe_id uuid references public.recipes (id) on delete set null,
  -- Free-text fallback for "sobras" or a meal out.
  custom_title text,
  servings smallint not null default 2 check (servings between 1 and 30),
  mode public.chef_mode,
  -- 'auto' entries may be replaced by the planner; 'manual' ones never are.
  source text not null default 'manual' check (source in ('auto', 'manual')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date, slot),
  constraint plan_entry_has_content check (recipe_id is not null or custom_title is not null)
);

create index meal_plan_entries_user_date_idx on public.meal_plan_entries (user_id, plan_date);

create trigger meal_plan_entries_set_updated_at
  before update on public.meal_plan_entries
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Shopping lists. Grouped by aisle in the UI, hence the aisle column on items.
-- ----------------------------------------------------------------------------
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Lista de compras',
  week_start date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_lists_user_idx on public.shopping_lists (user_id, created_at desc);

-- One open list at a time keeps the "Compras" tab unambiguous.
create unique index shopping_lists_one_open_idx
  on public.shopping_lists (user_id)
  where archived_at is null;

create trigger shopping_lists_set_updated_at
  before update on public.shopping_lists
  for each row execute function public.set_updated_at();

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  -- Where the line came from, so removing a recipe from the plan can remove it.
  recipe_id uuid references public.recipes (id) on delete set null,
  display_name text not null,
  quantity numeric(9, 3) check (quantity >= 0),
  unit text,
  aisle public.shopping_aisle not null default 'outros',
  is_checked boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_items_list_idx on public.shopping_items (list_id, aisle, position);

create trigger shopping_items_set_updated_at
  before update on public.shopping_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Diário — what was actually eaten. Recipe-linked entries copy their nutrition
-- at log time so later recipe edits do not rewrite history.
-- ----------------------------------------------------------------------------
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null default current_date,
  slot public.meal_slot not null,
  recipe_id uuid references public.recipes (id) on delete set null,
  title text not null,
  servings numeric(5, 2) not null default 1 check (servings > 0),

  kcal numeric(7, 2) check (kcal >= 0),
  protein_g numeric(6, 2) check (protein_g >= 0),
  carbs_g numeric(6, 2) check (carbs_g >= 0),
  fat_g numeric(6, 2) check (fat_g >= 0),

  logged_at timestamptz not null default now()
);

create index diary_entries_user_date_idx on public.diary_entries (user_id, entry_date desc);

-- ----------------------------------------------------------------------------
-- Meal prep — batch-cooking notes attached to a plan week.
-- ----------------------------------------------------------------------------
create table public.prep_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create trigger prep_notes_set_updated_at
  before update on public.prep_notes
  for each row execute function public.set_updated_at();
