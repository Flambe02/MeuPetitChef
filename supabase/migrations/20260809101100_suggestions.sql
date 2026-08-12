-- ============================================================================
-- Meu Petit Chef — 11. Personalised suggestions
--
-- The home screen's whole premise is "adapted to you": it shows one recipe and
-- justifies it. Ranking by `rating_avg` alone breaks that promise — a user with
-- an Air Fryer and no oven was being handed three oven recipes, none of which
-- had a variant for their chef.
--
-- The fit score already exists (`score_cooking_path`, migration 08). This RPC
-- puts it to work: a recipe is worth suggesting when its *best* route fits the
-- caller's kitchen, and it is worth suggesting more when it speaks the caller's
-- chef mode. Recipes that fit badly still come back, ranked last, rather than
-- being filtered out — a new account owning nothing must not get an empty home.
-- ============================================================================

create or replace function public.suggest_recipes(
  target_mode public.chef_mode default 'normal',
  page_limit integer default 8
)
returns setof public.recipe_cards
language sql
stable
set search_path = public
as $$
  select c.*
  from public.recipe_cards c
  where c.status = 'published'
  order by
    -- Best route this kitchen can actually run. Null (no published path) sinks.
    (
      select max(public.score_cooking_path(p.required_equipment))
      from public.cooking_paths p
      where p.recipe_id = c.id
    ) desc nulls last,
    -- A recipe rewritten for this chef outranks one that only exists as normal.
    (c.variants ? target_mode::text) desc,
    c.rating_avg desc,
    c.published_at desc nulls last
  limit greatest(page_limit, 1);
$$;

comment on function public.suggest_recipes is
  'Published recipes ranked by how well their best cooking path fits the caller''s equipment, then by whether a variant exists for the requested chef mode.';
