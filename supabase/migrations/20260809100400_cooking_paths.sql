-- ============================================================================
-- Meu Petit Chef — 04. Cooking paths, steps and control dials
--
-- A recipe is not "a list of steps". It is N alternative routes to the same
-- dish, one per plausible appliance combination. The app picks the best route
-- for the kitchen the user actually owns.
-- ============================================================================

create table public.cooking_paths (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  slug text not null,
  name text not null,

  -- Every appliance this route needs. Used to score the path against the
  -- user's profile_equipment.
  required_equipment public.equipment_type[] not null default '{}',
  total_minutes smallint check (total_minutes > 0),
  active_minutes smallint check (active_minutes > 0),
  difficulty public.difficulty,

  is_recommended boolean not null default false,
  -- Shown under the recommendation ("Mais rápido, menos louça...").
  reason text,
  -- Rough dish count; feeds the "pouca louça" preference.
  vessel_count smallint check (vessel_count >= 0),
  position smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, slug)
);

create index cooking_paths_recipe_idx on public.cooking_paths (recipe_id, position);
create index cooking_paths_equipment_idx
  on public.cooking_paths using gin (required_equipment);

create trigger cooking_paths_set_updated_at
  before update on public.cooking_paths
  for each row execute function public.set_updated_at();

-- At most one recommended path per recipe.
create unique index cooking_paths_one_recommended_idx
  on public.cooking_paths (recipe_id)
  where is_recommended;

-- ----------------------------------------------------------------------------
-- Steps. Two granularities coexist on purpose:
--   * `is_micro = false` — the readable recipe card ("Leve ao forno coberto").
--   * `is_micro = true`  — the one-action-per-screen guided cook mode
--                          ("Adicionar 2 dentes de alho").
-- ----------------------------------------------------------------------------
create table public.cooking_steps (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.cooking_paths (id) on delete cascade,
  position smallint not null,
  is_micro boolean not null default false,

  -- Imperative verb shown as the step's headline in cook mode ("Refogar").
  verb text,
  instruction text not null,
  equipment public.equipment_type not null default 'none',

  duration_seconds integer check (duration_seconds >= 0),
  timer_enabled boolean not null default false,
  alert_text text,

  -- Parallelism: "while the chicken is in the air fryer, make the sauce".
  can_run_parallel boolean not null default false,
  depends_on_step_id uuid references public.cooking_steps (id) on delete set null,

  image_path text,

  created_at timestamptz not null default now(),
  unique (path_id, is_micro, position),
  constraint timer_needs_duration
    check (not timer_enabled or duration_seconds is not null)
);

create index cooking_steps_path_idx on public.cooking_steps (path_id, is_micro, position);

-- Which ingredients a step touches, so cook mode can surface just those.
create table public.cooking_step_ingredients (
  step_id uuid not null references public.cooking_steps (id) on delete cascade,
  recipe_ingredient_id uuid not null references public.recipe_ingredients (id) on delete cascade,
  primary key (step_id, recipe_ingredient_id)
);

-- ----------------------------------------------------------------------------
-- Control dials — the Thermomix-style readout under each step.
-- `value_num` is for machine use (timers, comparisons); `value_text` is what
-- the screen prints ("Médio-baixo", "1 · inverso").
-- ----------------------------------------------------------------------------
create table public.cooking_step_dials (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.cooking_steps (id) on delete cascade,
  position smallint not null default 0,
  kind public.dial_kind not null,
  value_num numeric(8, 2),
  value_text text,
  sub_label text,
  unique (step_id, kind),
  constraint dial_has_a_value check (value_num is not null or value_text is not null)
);

create index cooking_step_dials_step_idx on public.cooking_step_dials (step_id, position);

-- ----------------------------------------------------------------------------
-- Per-appliance execution detail. Lets one step carry the numbers for a 4 L and
-- an 8 L air fryer without duplicating the whole path.
-- ----------------------------------------------------------------------------
create table public.cooking_step_equipment_specs (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.cooking_steps (id) on delete cascade,
  equipment public.equipment_type not null,
  capacity_min_litres numeric(5, 2),
  capacity_max_litres numeric(5, 2),
  temperature_c smallint check (temperature_c between 0 and 350),
  duration_seconds integer check (duration_seconds >= 0),
  needs_preheat boolean not null default false,
  accessory text,
  note text,
  constraint capacity_range_ordered
    check (
      capacity_min_litres is null
      or capacity_max_litres is null
      or capacity_min_litres <= capacity_max_litres
    )
);

create index cooking_step_equipment_specs_step_idx
  on public.cooking_step_equipment_specs (step_id);

-- ----------------------------------------------------------------------------
-- Free-form recipe notes: tips, storage, allergens, chef commentary.
-- ----------------------------------------------------------------------------
create table public.recipe_notes (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  kind text not null default 'tip'
    check (kind in ('tip', 'storage', 'allergen', 'substitution', 'nutrition', 'warning')),
  title text,
  body text not null,
  position smallint not null default 0
);

create index recipe_notes_recipe_idx on public.recipe_notes (recipe_id, position);
