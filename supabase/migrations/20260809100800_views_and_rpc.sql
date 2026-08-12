-- ============================================================================
-- Meu Petit Chef — 08. Read models and RPCs
--
-- Views are declared `security_invoker = on` so the caller's RLS applies:
-- a view must never become a hole around row-level security.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- recipe_cards — everything a recipe card renders, in one row. Avoids the
-- N+1 the home screen would otherwise do across variants, paths and tags.
-- ----------------------------------------------------------------------------
create view public.recipe_cards
with (security_invoker = on)
as
select
  r.id,
  r.slug,
  r.title,
  r.subtitle,
  r.hero_image_path,
  r.author_name,
  r.cuisine,
  r.category,
  r.difficulty,
  r.total_minutes,
  r.active_minutes,
  r.default_servings,
  r.rating_avg,
  r.rating_count,
  r.status,
  r.published_at,
  coalesce(eq.equipment, '{}'::public.equipment_type[]) as equipment,
  coalesce(tg.tags, '{}'::text[]) as tags,
  coalesce(va.variants, '{}'::jsonb) as variants
from public.recipes r
left join lateral (
  select array_agg(distinct e order by e) as equipment
  from public.cooking_paths p
  cross join unnest(p.required_equipment) as e
  where p.recipe_id = r.id
) eq on true
left join lateral (
  select array_agg(t.label order by t.label) as tags
  from public.recipe_tags rt
  join public.tags t on t.id = rt.tag_id
  where rt.recipe_id = r.id
) tg on true
left join lateral (
  select jsonb_object_agg(
    v.mode,
    jsonb_build_object(
      'id', v.id,
      'kcal', v.kcal,
      'protein_g', v.protein_g,
      'carbs_g', v.carbs_g,
      'fat_g', v.fat_g,
      'fiber_g', v.fiber_g,
      'summary', v.summary,
      'changes', v.changes
    )
  ) as variants
  from public.recipe_variants v
  where v.recipe_id = r.id
) va on true;

comment on view public.recipe_cards is
  'Denormalised read model for recipe lists: equipment, tags and per-mode nutrition inline.';

-- ----------------------------------------------------------------------------
-- Full-text + trigram search over published recipes, with the filters the
-- Buscar screen exposes.
-- ----------------------------------------------------------------------------
create or replace function public.search_recipes(
  query text default null,
  equipment_filter public.equipment_type[] default null,
  max_total_minutes integer default null,
  max_kcal integer default null,
  min_protein_g integer default null,
  difficulty_filter public.difficulty default null,
  mode_filter public.chef_mode default 'normal',
  page_limit integer default 24,
  page_offset integer default 0
)
returns setof public.recipe_cards
language sql
stable
set search_path = public
as $$
  with normalized as (
    select nullif(trim(coalesce(query, '')), '') as q
  )
  select c.*
  from public.recipe_cards c
  cross join normalized n
  where c.status = 'published'
    and (
      n.q is null
      or exists (
        select 1 from public.recipes r
        where r.id = c.id
          and (
            r.search_vector @@ plainto_tsquery('portuguese', public.mpc_normalize(n.q))
            or public.mpc_normalize(r.title) like '%' || public.mpc_normalize(n.q) || '%'
          )
      )
    )
    and (equipment_filter is null or c.equipment && equipment_filter)
    and (max_total_minutes is null or c.total_minutes <= max_total_minutes)
    and (difficulty_filter is null or c.difficulty = difficulty_filter)
    and (
      max_kcal is null
      or (c.variants -> mode_filter::text ->> 'kcal')::numeric <= max_kcal
    )
    and (
      min_protein_g is null
      or (c.variants -> mode_filter::text ->> 'protein_g')::numeric >= min_protein_g
    )
  order by c.rating_avg desc, c.published_at desc nulls last
  limit greatest(page_limit, 1)
  offset greatest(page_offset, 0);
$$;

-- ----------------------------------------------------------------------------
-- Score a cooking path against the caller's kitchen.
--   100  every required appliance is owned
--    -40 per missing appliance
--    +10 per preferred appliance used
--    -25 per excluded appliance used
-- Returns null for paths the user cannot run at all is *not* what we want —
-- the UI still lists them, greyed out — so the score simply goes negative.
-- ----------------------------------------------------------------------------
create or replace function public.score_cooking_path(
  path_equipment public.equipment_type[],
  target_user uuid default auth.uid()
)
returns integer
language sql
stable
set search_path = public
as $$
  select
    100
    - 40 * (
      select count(*)
      from unnest(path_equipment) req
      where req <> 'none'
        and not exists (
          select 1 from public.profile_equipment pe
          where pe.user_id = target_user and pe.equipment = req and not pe.is_excluded
        )
    )
    + 10 * (
      select count(*)
      from unnest(path_equipment) req
      join public.profile_equipment pe
        on pe.user_id = target_user and pe.equipment = req and pe.is_preferred
    )
    - 25 * (
      select count(*)
      from unnest(path_equipment) req
      join public.profile_equipment pe
        on pe.user_id = target_user and pe.equipment = req and pe.is_excluded
    );
$$;

-- ----------------------------------------------------------------------------
-- The cooking paths of one recipe, best-fit first for the current user.
-- ----------------------------------------------------------------------------
create or replace function public.recipe_paths_for_me(target_recipe uuid)
returns table (
  id uuid,
  slug text,
  name text,
  required_equipment public.equipment_type[],
  total_minutes smallint,
  active_minutes smallint,
  is_recommended boolean,
  reason text,
  vessel_count smallint,
  fit_score integer,
  missing_equipment public.equipment_type[]
)
language sql
stable
set search_path = public
as $$
  select
    p.id,
    p.slug,
    p.name,
    p.required_equipment,
    p.total_minutes,
    p.active_minutes,
    p.is_recommended,
    p.reason,
    p.vessel_count,
    public.score_cooking_path(p.required_equipment) as fit_score,
    coalesce(
      (
        select array_agg(req)
        from unnest(p.required_equipment) req
        where req <> 'none'
          and not exists (
            select 1 from public.profile_equipment pe
            where pe.user_id = auth.uid() and pe.equipment = req and not pe.is_excluded
          )
      ),
      '{}'::public.equipment_type[]
    ) as missing_equipment
  from public.cooking_paths p
  where p.recipe_id = target_recipe
  order by public.score_cooking_path(p.required_equipment) desc,
           p.is_recommended desc,
           p.total_minutes asc nulls last,
           p.position asc;
$$;

-- ----------------------------------------------------------------------------
-- Push a recipe's ingredient list onto the open shopping list, merging with
-- what is already there and skipping what the pantry already holds.
-- ----------------------------------------------------------------------------
create or replace function public.add_recipe_to_shopping_list(
  target_recipe uuid,
  target_servings smallint default null,
  target_mode public.chef_mode default 'normal',
  skip_pantry boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  list uuid;
  factor numeric;
  base_servings smallint;
begin
  if auth.uid() is null then
    raise exception 'add_recipe_to_shopping_list requires an authenticated user';
  end if;

  select default_servings into base_servings from public.recipes where id = target_recipe;
  if base_servings is null then
    raise exception 'recipe % not found', target_recipe;
  end if;
  factor := coalesce(target_servings, base_servings)::numeric / base_servings;

  select id into list
  from public.shopping_lists
  where user_id = auth.uid() and archived_at is null
  limit 1;

  if list is null then
    insert into public.shopping_lists (user_id) values (auth.uid()) returning id into list;
  end if;

  insert into public.shopping_items
    (list_id, ingredient_id, recipe_id, display_name, quantity, unit, aisle)
  select
    list,
    ri.ingredient_id,
    target_recipe,
    coalesce(vi.display_name, ri.display_name),
    case when ri.is_scalable then coalesce(vi.quantity, ri.quantity) * factor
         else coalesce(vi.quantity, ri.quantity) end,
    coalesce(vi.unit, ri.unit),
    coalesce(i.aisle, 'outros'::public.shopping_aisle)
  from public.recipe_ingredients ri
  left join public.recipe_variants v
    on v.recipe_id = ri.recipe_id and v.mode = target_mode
  left join public.recipe_variant_ingredients vi
    on vi.variant_id = v.id and vi.recipe_ingredient_id = ri.id
  left join public.ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = target_recipe
    and coalesce(vi.is_removed, false) = false
    and ri.is_optional = false
    and (
      not skip_pantry
      or not exists (
        select 1 from public.pantry_items p
        where p.user_id = auth.uid()
          and (
            (p.ingredient_id is not null and p.ingredient_id = ri.ingredient_id)
            or public.mpc_normalize(p.display_name) = public.mpc_normalize(ri.display_name)
          )
      )
    );

  return list;
end;
$$;
