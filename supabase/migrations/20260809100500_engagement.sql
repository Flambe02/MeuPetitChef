-- ============================================================================
-- Meu Petit Chef — 05. Favourites, collections, ratings, cook history
-- ============================================================================

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index favorites_recipe_idx on public.favorites (recipe_id);
create index favorites_user_recent_idx on public.favorites (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Collections — the "Meu livro" screen ("Receitas leves", "Air fryer"...).
-- ----------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  emoji text,
  cover_recipe_id uuid references public.recipes (id) on delete set null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index collections_user_idx on public.collections (user_id, position);

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_recipes (
  collection_id uuid not null references public.collections (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position smallint not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, recipe_id)
);

create index collection_recipes_recipe_idx on public.collection_recipes (recipe_id);

-- ----------------------------------------------------------------------------
-- Ratings. One per user per recipe; recipes.rating_avg is kept in sync by
-- trigger so recipe cards never need an aggregate at read time.
-- ----------------------------------------------------------------------------
create table public.recipe_ratings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index recipe_ratings_recipe_idx on public.recipe_ratings (recipe_id);

create trigger recipe_ratings_set_updated_at
  before update on public.recipe_ratings
  for each row execute function public.set_updated_at();

create or replace function public.recipe_ratings_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_recipe uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  update public.recipes r
  set
    rating_avg = coalesce(agg.avg_rating, 0),
    rating_count = coalesce(agg.n, 0)
  from (
    select avg(rating)::numeric(3, 2) as avg_rating, count(*) as n
    from public.recipe_ratings
    where recipe_id = target_recipe
  ) agg
  where r.id = target_recipe;
  return null;
end;
$$;

create trigger recipe_ratings_sync_avg
  after insert or update or delete on public.recipe_ratings
  for each row execute function public.recipe_ratings_sync();

-- ----------------------------------------------------------------------------
-- Cook sessions — every time the guided mode is opened. This is the retention
-- metric the concept document cares about: started vs finished.
-- ----------------------------------------------------------------------------
create table public.cook_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  path_id uuid references public.cooking_paths (id) on delete set null,
  mode public.chef_mode not null default 'normal',
  servings smallint not null default 2 check (servings between 1 and 30),

  current_step smallint not null default 0 check (current_step >= 0),
  completed_step_ids uuid[] not null default '{}',

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  abandoned_at timestamptz,
  notes text,

  constraint session_not_both_finished_and_abandoned
    check (finished_at is null or abandoned_at is null)
);

create index cook_sessions_user_recent_idx on public.cook_sessions (user_id, started_at desc);
create index cook_sessions_recipe_idx on public.cook_sessions (recipe_id);

-- Only one live session per user per recipe; resuming reuses it.
create unique index cook_sessions_active_idx
  on public.cook_sessions (user_id, recipe_id)
  where finished_at is null and abandoned_at is null;
