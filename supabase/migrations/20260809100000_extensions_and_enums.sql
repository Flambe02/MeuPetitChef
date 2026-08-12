-- ============================================================================
-- Meu Petit Chef — 00. Extensions, enums and shared helpers
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;
create extension if not exists "unaccent" with schema extensions;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

-- Every appliance the app can plan a cooking path around. `none` = bare
-- countertop work (assembling, resting, plating) — it is a real step type.
create type public.equipment_type as enum (
  'air_fryer',
  'oven',
  'stovetop',
  'thermomix',
  'microwave',
  'blender',
  'pressure_cooker',
  'electric_cooker',
  'barbecue',
  'sous_vide',
  'other',
  'none'
);

-- The three "chefs". They are the product's nutrition axis: a recipe carries
-- one variant per mode, and the UI never shows raw diet jargon.
create type public.chef_mode as enum ('normal', 'gourmand', 'fit');

create type public.difficulty as enum ('facil', 'medio', 'dificil');

create type public.recipe_status as enum ('draft', 'review', 'published', 'archived');

create type public.skill_level as enum ('beginner', 'occasional', 'confident', 'advanced');

create type public.app_role as enum ('user', 'editor', 'admin');

create type public.meal_slot as enum ('cafe', 'almoco', 'lanche', 'jantar', 'ceia');

-- Drives quantity scaling. `count` rounds to whole units, `mass`/`volume` round
-- to 5, `pinch`/`to_taste` never scale at all.
create type public.unit_kind as enum ('mass', 'volume', 'count', 'spoon', 'pinch', 'to_taste');

-- The dials shown on a cook-mode step, mirroring a Thermomix control panel.
create type public.dial_kind as enum (
  'tempo',
  'temperatura',
  'velocidade',
  'potencia',
  'modo',
  'alerta'
);

create type public.shopping_aisle as enum (
  'hortifruti',
  'acougue',
  'peixaria',
  'mercearia',
  'laticinios',
  'padaria',
  'congelados',
  'bebidas',
  'outros'
);

create type public.import_source as enum ('url', 'text', 'image', 'pdf', 'manual');

create type public.import_status as enum (
  'pending',
  'extracting',
  'needs_review',
  'accepted',
  'failed'
);

create type public.preference_kind as enum ('cuisine', 'style', 'time', 'restriction');

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Generic BEFORE UPDATE trigger keeping updated_at honest.';

-- `unaccent` is not marked immutable, so it cannot be used in a generated
-- column or an expression index. Search vectors are therefore maintained by
-- trigger (see 03_recipes) rather than generated.
create or replace function public.mpc_normalize(input text)
returns text
language sql
immutable
strict
parallel safe
set search_path = extensions, public
as $$
  select lower(extensions.unaccent(input));
$$;

comment on function public.mpc_normalize is
  'Lowercases and strips accents. Used for search and for slug generation.';

create or replace function public.mpc_slugify(input text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select trim(both '-' from regexp_replace(public.mpc_normalize(input), '[^a-z0-9]+', '-', 'g'));
$$;
