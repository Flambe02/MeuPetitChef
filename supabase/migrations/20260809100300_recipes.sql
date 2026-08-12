-- ============================================================================
-- Meu Petit Chef — 03. Recipes, tags, variants and ingredient lists
-- ============================================================================

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  description text,

  hero_image_path text,
  author_name text not null default 'Petit Chef',
  cuisine text,
  category text,

  difficulty public.difficulty not null default 'facil',
  total_minutes smallint not null check (total_minutes > 0),
  active_minutes smallint check (active_minutes > 0),
  default_servings smallint not null default 2 check (default_servings between 1 and 30),

  rating_avg numeric(3, 2) not null default 0 check (rating_avg between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),

  status public.recipe_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  -- Maintained by trigger (unaccent is not immutable, so no generated column).
  search_vector tsvector,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint active_time_within_total check (active_minutes is null or active_minutes <= total_minutes),
  constraint published_has_date check (status <> 'published' or published_at is not null)
);

create index recipes_status_published_idx on public.recipes (status, published_at desc);
create index recipes_search_idx on public.recipes using gin (search_vector);
create index recipes_title_trgm_idx
  on public.recipes using gin (public.mpc_normalize(title) extensions.gin_trgm_ops);
create index recipes_total_minutes_idx on public.recipes (total_minutes);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create or replace function public.recipes_refresh_search_vector()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('portuguese', public.mpc_normalize(coalesce(new.title, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.mpc_normalize(coalesce(new.subtitle, ''))), 'B') ||
    setweight(to_tsvector('portuguese', public.mpc_normalize(coalesce(new.cuisine, ''))), 'C') ||
    setweight(to_tsvector('portuguese', public.mpc_normalize(coalesce(new.category, ''))), 'C') ||
    setweight(to_tsvector('portuguese', public.mpc_normalize(coalesce(new.description, ''))), 'D');
  if new.slug is null or new.slug = '' then
    new.slug := public.mpc_slugify(new.title);
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger recipes_search_vector
  before insert or update of title, subtitle, description, cuisine, category, slug, status
  on public.recipes
  for each row execute function public.recipes_refresh_search_vector();

-- ----------------------------------------------------------------------------
-- Tags. Free vocabulary, curated in the back-office.
-- ----------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  kind text not null default 'theme',
  created_at timestamptz not null default now()
);

create table public.recipe_tags (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (recipe_id, tag_id)
);

create index recipe_tags_tag_idx on public.recipe_tags (tag_id);

-- ----------------------------------------------------------------------------
-- Variants: one row per chef mode. This is the nutrition axis of the product.
-- ----------------------------------------------------------------------------
create table public.recipe_variants (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  mode public.chef_mode not null,

  -- Per serving, at the recipe's default_servings.
  kcal numeric(7, 2) check (kcal >= 0),
  protein_g numeric(6, 2) check (protein_g >= 0),
  carbs_g numeric(6, 2) check (carbs_g >= 0),
  fat_g numeric(6, 2) check (fat_g >= 0),
  fiber_g numeric(6, 2) check (fiber_g >= 0),

  summary text,
  -- Human-readable diff against the original, shown as bullets in the UI.
  changes text[] not null default '{}',
  servings_factor numeric(4, 2) not null default 1 check (servings_factor > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, mode)
);

create index recipe_variants_recipe_idx on public.recipe_variants (recipe_id);

create trigger recipe_variants_set_updated_at
  before update on public.recipe_variants
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Ingredient groups ("Molho branco", "Recheio de frango", "Montagem").
-- ----------------------------------------------------------------------------
create table public.recipe_ingredient_groups (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position smallint not null default 0,
  name text not null,
  unique (recipe_id, position)
);

create index recipe_ingredient_groups_recipe_idx on public.recipe_ingredient_groups (recipe_id);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  group_id uuid references public.recipe_ingredient_groups (id) on delete set null,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  position smallint not null default 0,

  -- Denormalised on purpose: the recipe must still read correctly when the
  -- ingredient row is missing (imports) or later renamed.
  display_name text not null,
  quantity numeric(9, 3) check (quantity >= 0),
  unit text,
  unit_kind public.unit_kind not null default 'mass',
  note text,

  is_optional boolean not null default false,
  -- "1 pitada", "a gosto" and garnishes must not multiply with the servings.
  is_scalable boolean not null default true,

  created_at timestamptz not null default now()
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_ingredients_group_idx on public.recipe_ingredients (group_id, position);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

-- ----------------------------------------------------------------------------
-- How a variant rewrites the base ingredient list. Absence of a row means the
-- variant uses the base line unchanged — so "Original" needs zero overrides.
-- ----------------------------------------------------------------------------
create table public.recipe_variant_ingredients (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.recipe_variants (id) on delete cascade,
  recipe_ingredient_id uuid not null references public.recipe_ingredients (id) on delete cascade,

  is_removed boolean not null default false,
  display_name text,
  quantity numeric(9, 3) check (quantity >= 0),
  unit text,
  unit_kind public.unit_kind,
  note text,
  replacement_ingredient_id uuid references public.ingredients (id) on delete set null,

  unique (variant_id, recipe_ingredient_id)
);

create index recipe_variant_ingredients_variant_idx
  on public.recipe_variant_ingredients (variant_id);

-- Extra ingredients a variant *adds* (whey for the protein mode, cream for the
-- gourmand one) have no base line to point at, so they get their own table.
create table public.recipe_variant_extra_ingredients (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.recipe_variants (id) on delete cascade,
  group_id uuid references public.recipe_ingredient_groups (id) on delete set null,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  position smallint not null default 0,
  display_name text not null,
  quantity numeric(9, 3) check (quantity >= 0),
  unit text,
  unit_kind public.unit_kind not null default 'mass',
  note text,
  is_scalable boolean not null default true
);

create index recipe_variant_extra_variant_idx
  on public.recipe_variant_extra_ingredients (variant_id, position);
