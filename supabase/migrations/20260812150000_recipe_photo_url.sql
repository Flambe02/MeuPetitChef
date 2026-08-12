-- ============================================================================
-- Meu Petit Chef — 16. A photo, linked rather than stored
--
-- Two image columns already exist, and neither answers the need:
--
--   * `hero_image_path` points into our own bucket. It is what a published
--     recipe uses, and it presumes an upload we do not want to ask for.
--   * `source_image_url` is provenance. Migration 13 says so explicitly —
--     "kept for review only" — and it belongs to the site the recipe was read
--     from, not to the cook.
--
-- `photo_url` is the third case, and the one people actually have: a picture
-- that already exists somewhere on the web, pointed at. Nothing is downloaded,
-- nothing is re-hosted, and no storage policy has to be written.
--
-- The cost is stated rather than hidden: a linked photo can rot, and can change
-- under us. That is acceptable for a private recipe in someone's own book — the
-- worst case is a missing image, which every screen already handles because
-- `hero_image_path` has always been nullable. It is *not* acceptable for the
-- published catalogue, which keeps using our own bucket.
-- ============================================================================

alter table public.recipes
  add column photo_url text;

comment on column public.recipes.photo_url is
  'A photo that lives elsewhere, linked and never downloaded. Takes precedence over hero_image_path for display. Published catalogue recipes should still use hero_image_path.';

-- ----------------------------------------------------------------------------
-- The card read model carries it too, or every list would have to fetch the
-- recipe row again just to draw a thumbnail.
--
-- `create or replace view` only tolerates new columns at the end, so the
-- existing select list is reproduced verbatim and `photo_url` is appended.
-- ----------------------------------------------------------------------------
create or replace view public.recipe_cards
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
  coalesce(va.variants, '{}'::jsonb) as variants,
  r.photo_url
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
  'Denormalised read model for recipe lists: equipment, tags, per-mode nutrition and the linked photo inline.';
