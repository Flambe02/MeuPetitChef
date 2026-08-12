-- ============================================================================
-- Meu Petit Chef — 01. User profile, kitchen equipment, preferences
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_path text,
  locale text not null default 'pt-BR',
  role public.app_role not null default 'user',

  -- Onboarding answers that drive every adaptation in the app.
  chef_mode public.chef_mode not null default 'normal',
  skill_level public.skill_level,
  default_servings smallint not null default 2 check (default_servings between 1 and 20),
  max_active_minutes smallint check (max_active_minutes between 5 and 480),

  -- Nutrition targets. Null means "do not show a goal ring".
  daily_kcal_goal integer check (daily_kcal_goal between 800 and 6000),
  daily_protein_goal_g integer check (daily_protein_goal_g between 20 and 400),

  -- UI settings.
  theme text not null default 'porcelain' check (theme in ('porcelain', 'graphite', 'system')),
  keep_screen_awake boolean not null default true,
  timer_sound boolean not null default true,
  voice_guidance boolean not null default false,

  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Created automatically by a trigger on auth.users.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-provision a profile whenever Supabase Auth creates a user.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill. The trigger only fires on new rows, so any account that already
-- exists when this migration lands — someone who signed up against the project
-- before the schema was pushed, or a user created from the dashboard — would
-- otherwise never get a profile, and `RequireOnboarding` would wave them into an
-- app with nothing behind it. Idempotent, so replaying the migration is safe.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(u.email, '@', 1)
  )
from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Role helper. SECURITY DEFINER so RLS policies can call it without recursing
-- into the profiles policies.
-- ----------------------------------------------------------------------------
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('editor', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- Kitchen equipment. One row per appliance the user actually owns; `spec`
-- carries the free-form model detail the onboarding asks for ("6 litros", "TM7").
-- ----------------------------------------------------------------------------
create table public.profile_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  equipment public.equipment_type not null,
  spec text,
  capacity_litres numeric(5, 2) check (capacity_litres > 0),
  power_watts integer check (power_watts > 0),
  is_preferred boolean not null default false,
  is_excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, equipment),
  -- Owning an appliance and refusing to use it are different states, but
  -- "preferred and excluded" is nonsense.
  constraint equipment_not_both_preferred_and_excluded
    check (not (is_preferred and is_excluded))
);

create index profile_equipment_user_idx on public.profile_equipment (user_id);

create trigger profile_equipment_set_updated_at
  before update on public.profile_equipment
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Free-form onboarding chips: cuisines, cooking styles, time windows and
-- dietary restrictions all share one narrow table.
-- ----------------------------------------------------------------------------
create table public.profile_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.preference_kind not null,
  value text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

create index profile_preferences_user_kind_idx on public.profile_preferences (user_id, kind);

-- ----------------------------------------------------------------------------
-- Hard "never serve me this" list. Stronger than a restriction chip: it filters
-- recipes out of search and suggestions entirely.
-- ----------------------------------------------------------------------------
create table public.profile_disliked_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ingredient_id uuid,
  display_name text not null,
  is_allergy boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, display_name)
);

create index profile_disliked_user_idx on public.profile_disliked_ingredients (user_id);
