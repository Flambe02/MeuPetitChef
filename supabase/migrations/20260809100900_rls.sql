-- ============================================================================
-- Meu Petit Chef — 09. Row Level Security
--
-- Two shapes only:
--   * Content tables  — anyone may read a *published* recipe; only editors write.
--   * User tables     — the owner reads and writes their own rows, nobody else.
-- Every table below has RLS enabled. A table with no policy is deny-all, which
-- is the correct default when something is forgotten.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere
-- ----------------------------------------------------------------------------
alter table public.profiles                          enable row level security;
alter table public.profile_equipment                 enable row level security;
alter table public.profile_preferences               enable row level security;
alter table public.profile_disliked_ingredients      enable row level security;
alter table public.ingredients                       enable row level security;
alter table public.ingredient_substitutions          enable row level security;
alter table public.recipes                           enable row level security;
alter table public.tags                              enable row level security;
alter table public.recipe_tags                       enable row level security;
alter table public.recipe_variants                   enable row level security;
alter table public.recipe_ingredient_groups          enable row level security;
alter table public.recipe_ingredients                enable row level security;
alter table public.recipe_variant_ingredients        enable row level security;
alter table public.recipe_variant_extra_ingredients  enable row level security;
alter table public.cooking_paths                     enable row level security;
alter table public.cooking_steps                     enable row level security;
alter table public.cooking_step_ingredients          enable row level security;
alter table public.cooking_step_dials                enable row level security;
alter table public.cooking_step_equipment_specs      enable row level security;
alter table public.recipe_notes                      enable row level security;
alter table public.favorites                         enable row level security;
alter table public.collections                       enable row level security;
alter table public.collection_recipes                enable row level security;
alter table public.recipe_ratings                    enable row level security;
alter table public.cook_sessions                     enable row level security;
alter table public.pantry_items                      enable row level security;
alter table public.meal_plan_entries                 enable row level security;
alter table public.shopping_lists                    enable row level security;
alter table public.shopping_items                    enable row level security;
alter table public.diary_entries                     enable row level security;
alter table public.prep_notes                        enable row level security;
alter table public.recipe_imports                    enable row level security;
alter table public.adaptation_logs                   enable row level security;

-- ----------------------------------------------------------------------------
-- Profile
-- ----------------------------------------------------------------------------
create policy "profiles: read own"
  on public.profiles for select
  using (id = (select auth.uid()) or public.is_editor());

create policy "profiles: update own"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Insert exists as a fallback; the auth trigger normally gets there first.
create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Owner-only tables. Same shape repeated; kept explicit rather than generated
-- so the policy set is greppable.
-- ----------------------------------------------------------------------------
create policy "profile_equipment: own" on public.profile_equipment
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "profile_preferences: own" on public.profile_preferences
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "profile_disliked: own" on public.profile_disliked_ingredients
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "favorites: own" on public.favorites
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "collections: own" on public.collections
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "collection_recipes: own" on public.collection_recipes
  for all
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = (select auth.uid())
    )
  );

create policy "cook_sessions: own" on public.cook_sessions
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "pantry_items: own" on public.pantry_items
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "meal_plan_entries: own" on public.meal_plan_entries
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "shopping_lists: own" on public.shopping_lists
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "shopping_items: own" on public.shopping_items
  for all
  using (
    exists (
      select 1 from public.shopping_lists l
      where l.id = list_id and l.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.shopping_lists l
      where l.id = list_id and l.user_id = (select auth.uid())
    )
  );

create policy "diary_entries: own" on public.diary_entries
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "prep_notes: own" on public.prep_notes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "recipe_imports: own" on public.recipe_imports
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ratings are readable by everyone (they aggregate onto the recipe card) but
-- only writable by their author.
create policy "recipe_ratings: read all" on public.recipe_ratings
  for select using (true);
create policy "recipe_ratings: write own" on public.recipe_ratings
  for insert with check (user_id = (select auth.uid()));
create policy "recipe_ratings: update own" on public.recipe_ratings
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recipe_ratings: delete own" on public.recipe_ratings
  for delete using (user_id = (select auth.uid()));

create policy "adaptation_logs: own or editor" on public.adaptation_logs
  for select using (user_id = (select auth.uid()) or public.is_editor());
create policy "adaptation_logs: insert own" on public.adaptation_logs
  for insert with check (user_id = (select auth.uid()) or public.is_editor());

-- ----------------------------------------------------------------------------
-- Reference data — world-readable, editor-writable.
-- ----------------------------------------------------------------------------
create policy "ingredients: read all" on public.ingredients
  for select using (true);
create policy "ingredients: editors write" on public.ingredients
  for all using (public.is_editor()) with check (public.is_editor());

create policy "ingredient_substitutions: read all" on public.ingredient_substitutions
  for select using (true);
create policy "ingredient_substitutions: editors write" on public.ingredient_substitutions
  for all using (public.is_editor()) with check (public.is_editor());

create policy "tags: read all" on public.tags
  for select using (true);
create policy "tags: editors write" on public.tags
  for all using (public.is_editor()) with check (public.is_editor());

-- ----------------------------------------------------------------------------
-- Recipe content — published rows are public; drafts belong to their author
-- and to editors.
-- ----------------------------------------------------------------------------
create policy "recipes: read published" on public.recipes
  for select
  using (status = 'published' or created_by = (select auth.uid()) or public.is_editor());

create policy "recipes: editors write" on public.recipes
  for all using (public.is_editor()) with check (public.is_editor());

-- Child tables inherit visibility from their recipe. `recipe_is_visible` keeps
-- that rule in one place.
create or replace function public.recipe_is_visible(target_recipe uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = target_recipe
      and (r.status = 'published' or r.created_by = auth.uid() or public.is_editor())
  );
$$;

create policy "recipe_tags: follow recipe" on public.recipe_tags
  for select using (public.recipe_is_visible(recipe_id));
create policy "recipe_tags: editors write" on public.recipe_tags
  for all using (public.is_editor()) with check (public.is_editor());

create policy "recipe_variants: follow recipe" on public.recipe_variants
  for select using (public.recipe_is_visible(recipe_id));
create policy "recipe_variants: editors write" on public.recipe_variants
  for all using (public.is_editor()) with check (public.is_editor());

create policy "recipe_ingredient_groups: follow recipe" on public.recipe_ingredient_groups
  for select using (public.recipe_is_visible(recipe_id));
create policy "recipe_ingredient_groups: editors write" on public.recipe_ingredient_groups
  for all using (public.is_editor()) with check (public.is_editor());

create policy "recipe_ingredients: follow recipe" on public.recipe_ingredients
  for select using (public.recipe_is_visible(recipe_id));
create policy "recipe_ingredients: editors write" on public.recipe_ingredients
  for all using (public.is_editor()) with check (public.is_editor());

create policy "recipe_notes: follow recipe" on public.recipe_notes
  for select using (public.recipe_is_visible(recipe_id));
create policy "recipe_notes: editors write" on public.recipe_notes
  for all using (public.is_editor()) with check (public.is_editor());

create policy "cooking_paths: follow recipe" on public.cooking_paths
  for select using (public.recipe_is_visible(recipe_id));
create policy "cooking_paths: editors write" on public.cooking_paths
  for all using (public.is_editor()) with check (public.is_editor());

-- Grandchildren resolve through their parent path / variant.
create or replace function public.path_is_visible(target_path uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cooking_paths p
    where p.id = target_path and public.recipe_is_visible(p.recipe_id)
  );
$$;

create or replace function public.variant_is_visible(target_variant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.recipe_variants v
    where v.id = target_variant and public.recipe_is_visible(v.recipe_id)
  );
$$;

create policy "cooking_steps: follow path" on public.cooking_steps
  for select using (public.path_is_visible(path_id));
create policy "cooking_steps: editors write" on public.cooking_steps
  for all using (public.is_editor()) with check (public.is_editor());

create policy "cooking_step_dials: follow step" on public.cooking_step_dials
  for select using (
    exists (select 1 from public.cooking_steps s
            where s.id = step_id and public.path_is_visible(s.path_id))
  );
create policy "cooking_step_dials: editors write" on public.cooking_step_dials
  for all using (public.is_editor()) with check (public.is_editor());

create policy "cooking_step_ingredients: follow step" on public.cooking_step_ingredients
  for select using (
    exists (select 1 from public.cooking_steps s
            where s.id = step_id and public.path_is_visible(s.path_id))
  );
create policy "cooking_step_ingredients: editors write" on public.cooking_step_ingredients
  for all using (public.is_editor()) with check (public.is_editor());

create policy "cooking_step_equipment_specs: follow step" on public.cooking_step_equipment_specs
  for select using (
    exists (select 1 from public.cooking_steps s
            where s.id = step_id and public.path_is_visible(s.path_id))
  );
create policy "cooking_step_equipment_specs: editors write" on public.cooking_step_equipment_specs
  for all using (public.is_editor()) with check (public.is_editor());

create policy "recipe_variant_ingredients: follow variant" on public.recipe_variant_ingredients
  for select using (public.variant_is_visible(variant_id));
create policy "recipe_variant_ingredients: editors write" on public.recipe_variant_ingredients
  for all using (public.is_editor()) with check (public.is_editor());

create policy "recipe_variant_extra: follow variant" on public.recipe_variant_extra_ingredients
  for select using (public.variant_is_visible(variant_id));
create policy "recipe_variant_extra: editors write" on public.recipe_variant_extra_ingredients
  for all using (public.is_editor()) with check (public.is_editor());

-- ----------------------------------------------------------------------------
-- Grants. RLS decides the rows; grants decide the verbs.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant insert, update, delete on tables to authenticated;
