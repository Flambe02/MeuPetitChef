-- ============================================================================
-- Meu Petit Chef — Semana: a real weekly meal plan
--
-- `meal_plan_entries` (migration 06) already covers "one recipe per day and
-- slot" — this extends it rather than replacing it: a lifecycle (planned →
-- cooked), a lock so an automatic regeneration cannot overwrite a manual
-- choice, leftovers linked to the meal they came from, and eating-out/skipped
-- as first-class content instead of an empty row nobody can distinguish from
-- "not planned yet". `meal_plans` is new — one header row per (user, week),
-- carrying how that week was generated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

-- What a slot actually holds. 'recipe' is the only kind that ever carried
-- content before this migration; the other three used to be indistinguishable
-- from "nothing planned" because the row simply didn't exist.
create type public.meal_plan_entry_type as enum ('recipe', 'leftover', 'eating_out', 'skipped');

-- A slot's lifecycle. Deliberately two states, not three: "skipped" is a
-- meal_plan_entry_type (the slot itself), not something a recipe entry
-- transitions through.
create type public.meal_plan_status as enum ('planned', 'cooked');

-- The four intentions "Montar minha semana" offers. A generation run stamps
-- the one it used onto `meal_plans.generation_mode` so "Melhorar minha
-- semana" can repeat it rather than defaulting back to equilibrada.
create type public.meal_plan_generation_mode as enum ('equilibrada', 'pratica', 'economica', 'fit');

-- ----------------------------------------------------------------------------
-- meal_plan_entries — new columns
-- ----------------------------------------------------------------------------

alter table public.meal_plan_entries
  add column entry_type public.meal_plan_entry_type not null default 'recipe',
  add column status public.meal_plan_status not null default 'planned',
  -- Never touched by generateWeeklyMealPlan()/"Melhorar minha semana" — the
  -- one thing a lock has to guarantee.
  add column locked boolean not null default false,
  add column parent_entry_id uuid references public.meal_plan_entries (id) on delete set null,
  add column cooked_at timestamptz;

-- The original constraint assumed every entry was a recipe. Eating out and a
-- consciously empty slot carry no recipe/title at all; a leftover points at
-- the meal it came from instead of repeating that meal's own content.
alter table public.meal_plan_entries drop constraint plan_entry_has_content;
alter table public.meal_plan_entries
  add constraint plan_entry_has_content check (
    entry_type in ('eating_out', 'skipped')
    or (entry_type = 'recipe' and (recipe_id is not null or custom_title is not null))
    or (entry_type = 'leftover' and parent_entry_id is not null)
  );

create index meal_plan_entries_parent_idx
  on public.meal_plan_entries (parent_entry_id)
  where parent_entry_id is not null;

comment on column public.meal_plan_entries.locked is
  'Set by the person, never by the generator. A locked entry survives both the
   initial generation (it is never chosen over) and "Melhorar minha semana".';
comment on column public.meal_plan_entries.parent_entry_id is
  'For entry_type = leftover: the meal_plan_entries row this portion was
   cooked from. Eating a leftover never adds cooking time on its own day.';

-- ----------------------------------------------------------------------------
-- meal_plans — one header row per (user, week)
--
-- Not a status/archive lifecycle like shopping_lists: a week does not get
-- reused once it is over the way an open shopping list does, so there is
-- nothing to archive. It exists to remember *how* a week was built.
-- ----------------------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  generation_mode public.meal_plan_generation_mode,
  -- The bottom-sheet's checkboxes at the moment "Criar minha semana" ran
  -- (meals included, priorities, no-cook days) — free-form because that list
  -- is a UI concern, not a column-per-checkbox schema concern.
  generation_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  constraint meal_plans_week_range check (week_end = week_start + 6)
);

create index meal_plans_user_idx on public.meal_plans (user_id, week_start desc);

create trigger meal_plans_set_updated_at
  before update on public.meal_plans
  for each row execute function public.set_updated_at();

alter table public.meal_plans enable row level security;

create policy "meal_plans: own" on public.meal_plans
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- add_recipe_to_shopping_list — now merges instead of duplicating.
--
-- The original inserted one row per recipe ingredient, so two recipes both
-- needing "cebola" produced two separate lines rather than one summed
-- quantity. Same signature, same callers — only the insert itself changes.
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

  -- What this recipe contributes, one row per distinct ingredient (a variant
  -- rarely repeats one, but nothing forbids it, so the sum is taken here
  -- rather than relying on the source rows already being distinct).
  create temporary table if not exists _shopping_add (
    ingredient_id uuid,
    display_name text,
    quantity numeric,
    unit text,
    aisle public.shopping_aisle
  ) on commit drop;
  delete from _shopping_add;

  insert into _shopping_add (ingredient_id, display_name, quantity, unit, aisle)
  select
    ri.ingredient_id,
    coalesce(vi.display_name, ri.display_name),
    sum(case when ri.is_scalable then coalesce(vi.quantity, ri.quantity) * factor
             else coalesce(vi.quantity, ri.quantity) end),
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
    )
  group by ri.ingredient_id, coalesce(vi.display_name, ri.display_name),
           coalesce(vi.unit, ri.unit), coalesce(i.aisle, 'outros'::public.shopping_aisle);

  -- Fold into a matching line already on the list: same ingredient (by id, or
  -- by normalized name when neither has one) and the same unit — quantities
  -- in different units cannot be summed, so those become a second line rather
  -- than silently under-counting one of them. Never folds into an already
  -- checked item: the shopper has treated that line as done, and quietly
  -- reviving it with more quantity would be a surprise, not a convenience.
  update public.shopping_items si
  set quantity = coalesce(si.quantity, 0) + sa.quantity
  from _shopping_add sa
  where si.list_id = list
    and si.is_checked = false
    and (
      (si.ingredient_id is not null and si.ingredient_id = sa.ingredient_id)
      or (
        si.ingredient_id is null and sa.ingredient_id is null
        and public.mpc_normalize(si.display_name) = public.mpc_normalize(sa.display_name)
      )
    )
    and coalesce(si.unit, '') = coalesce(sa.unit, '');

  insert into public.shopping_items
    (list_id, ingredient_id, recipe_id, display_name, quantity, unit, aisle)
  select list, sa.ingredient_id, target_recipe, sa.display_name, sa.quantity, sa.unit, sa.aisle
  from _shopping_add sa
  where not exists (
    select 1 from public.shopping_items si
    where si.list_id = list
      and si.is_checked = false
      and (
        (si.ingredient_id is not null and si.ingredient_id = sa.ingredient_id)
        or (
          si.ingredient_id is null and sa.ingredient_id is null
          and public.mpc_normalize(si.display_name) = public.mpc_normalize(sa.display_name)
        )
      )
      and coalesce(si.unit, '') = coalesce(sa.unit, '')
  );

  return list;
end;
$$;
