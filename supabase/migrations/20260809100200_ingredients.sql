-- ============================================================================
-- Meu Petit Chef — 02. Ingredient reference table
-- Nutrition is stored per 100 g / 100 ml so every recipe computes from one
-- source of truth instead of carrying its own hand-typed calorie counts.
-- ============================================================================

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_plural text,
  aliases text[] not null default '{}',

  default_unit text not null default 'g',
  default_unit_kind public.unit_kind not null default 'mass',

  -- Conversion factors. Without these, "1 cebola" cannot become grams and the
  -- nutrition of the recipe is a guess.
  grams_per_unit numeric(8, 2) check (grams_per_unit > 0),
  grams_per_ml numeric(6, 3) check (grams_per_ml > 0),

  -- Per 100 g (or 100 ml for liquids).
  kcal_100 numeric(7, 2) check (kcal_100 >= 0),
  protein_100 numeric(6, 2) check (protein_100 >= 0),
  carbs_100 numeric(6, 2) check (carbs_100 >= 0),
  fat_100 numeric(6, 2) check (fat_100 >= 0),
  fiber_100 numeric(6, 2) check (fiber_100 >= 0),
  sodium_mg_100 numeric(8, 2) check (sodium_mg_100 >= 0),

  allergens text[] not null default '{}',
  aisle public.shopping_aisle not null default 'outros',

  -- Brazilian market flag: prefer these when proposing substitutions.
  is_common_in_br boolean not null default true,
  is_verified boolean not null default false,
  source_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.ingredients.grams_per_unit is
  'Mass of one countable unit ("1 cebola" = 150 g). Required for count-unit ingredients.';

create index ingredients_name_trgm_idx
  on public.ingredients using gin (public.mpc_normalize(name) extensions.gin_trgm_ops);
create index ingredients_aisle_idx on public.ingredients (aisle);

create trigger ingredients_set_updated_at
  before update on public.ingredients
  for each row execute function public.set_updated_at();

-- Late-bound FK: profile_disliked_ingredients was created before this table.
alter table public.profile_disliked_ingredients
  add constraint profile_disliked_ingredient_fk
  foreign key (ingredient_id) references public.ingredients (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Global substitution rules. Recipe-specific overrides live on the variant;
-- this table holds the reusable knowledge ("creme de leite -> iogurte natural").
-- ----------------------------------------------------------------------------
create table public.ingredient_substitutions (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  replacement_id uuid not null references public.ingredients (id) on delete cascade,
  -- Multiply the original quantity by this to get the replacement quantity.
  ratio numeric(6, 3) not null default 1 check (ratio > 0),
  -- Null = valid for every mode; otherwise this rule only fires for one chef.
  mode public.chef_mode,
  reason text,
  note text,
  priority smallint not null default 100,
  created_at timestamptz not null default now(),
  check (ingredient_id <> replacement_id),
  unique (ingredient_id, replacement_id, mode)
);

create index ingredient_substitutions_ingredient_idx
  on public.ingredient_substitutions (ingredient_id, priority);
