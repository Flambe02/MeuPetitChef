-- ============================================================================
-- Meu Petit Chef — 12. Recipes the user generates by talking to the app
--
-- The home screen gains a free-form chat: "quero cozinhar frango com berinjela
-- e cebola", pick the appliances, get a recipe, refine it, then cook it.
--
-- Two things have to be true for that to work with the app as it stands:
--
--   1. Cook mode only reads `recipes` + `cooking_paths` + `cooking_steps`. A
--      generated recipe must therefore become a real row, not a blob held in
--      memory — otherwise the landscape screens have nothing to render, and
--      favouriting or shopping-listing it would need a second code path.
--
--   2. `recipes` was editor-write only. The read policy already lets an author
--      see their own drafts (`created_by = auth.uid()`), but nothing let them
--      create one. That asymmetry is what this migration fixes.
--
-- Draft recipes are private by construction: `recipes: read published` admits a
-- row only when `status = 'published'`, or the caller wrote it, or they are an
-- editor. A generated draft is `status = 'draft'`, so it stays invisible to
-- everyone else without a single extra policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Ownership helper. SECURITY DEFINER so child-table policies can ask "may I
-- write to this recipe?" without needing their own copy of the rule.
-- ----------------------------------------------------------------------------
create or replace function public.owns_draft_recipe(target_recipe uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = target_recipe
      and r.created_by = auth.uid()
      and r.status = 'draft'
  );
$$;

comment on function public.owns_draft_recipe is
  'True when the caller authored this recipe and it is still a draft. Editors keep their own separate policies.';

-- ----------------------------------------------------------------------------
-- The recipe itself. Insert is restricted to drafts the caller authors, so this
-- policy can never be used to publish.
-- ----------------------------------------------------------------------------
create policy "recipes: author creates own draft" on public.recipes
  for insert
  with check (created_by = (select auth.uid()) and status = 'draft');

create policy "recipes: author edits own draft" on public.recipes
  for update
  using (created_by = (select auth.uid()) and status = 'draft')
  with check (created_by = (select auth.uid()) and status = 'draft');

create policy "recipes: author deletes own draft" on public.recipes
  for delete
  using (created_by = (select auth.uid()) and status = 'draft');

-- ----------------------------------------------------------------------------
-- Children. Same rule, resolved through the parent recipe.
-- ----------------------------------------------------------------------------
create policy "recipe_variants: author writes own draft" on public.recipe_variants
  for all using (public.owns_draft_recipe(recipe_id))
  with check (public.owns_draft_recipe(recipe_id));

create policy "recipe_ingredient_groups: author writes own draft"
  on public.recipe_ingredient_groups
  for all using (public.owns_draft_recipe(recipe_id))
  with check (public.owns_draft_recipe(recipe_id));

create policy "recipe_ingredients: author writes own draft" on public.recipe_ingredients
  for all using (public.owns_draft_recipe(recipe_id))
  with check (public.owns_draft_recipe(recipe_id));

create policy "recipe_notes: author writes own draft" on public.recipe_notes
  for all using (public.owns_draft_recipe(recipe_id))
  with check (public.owns_draft_recipe(recipe_id));

create policy "cooking_paths: author writes own draft" on public.cooking_paths
  for all using (public.owns_draft_recipe(recipe_id))
  with check (public.owns_draft_recipe(recipe_id));

-- Grandchildren resolve through their path.
create or replace function public.owns_draft_path(target_path uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cooking_paths p
    where p.id = target_path and public.owns_draft_recipe(p.recipe_id)
  );
$$;

create policy "cooking_steps: author writes own draft" on public.cooking_steps
  for all using (public.owns_draft_path(path_id))
  with check (public.owns_draft_path(path_id));

create policy "cooking_step_dials: author writes own draft" on public.cooking_step_dials
  for all
  using (
    exists (select 1 from public.cooking_steps s
            where s.id = step_id and public.owns_draft_path(s.path_id))
  )
  with check (
    exists (select 1 from public.cooking_steps s
            where s.id = step_id and public.owns_draft_path(s.path_id))
  );

-- ----------------------------------------------------------------------------
-- The conversation.
--
-- One row per generation thread: what the user asked, which appliances they
-- said they had, the turns of refinement, and the draft it produced. Kept
-- separate from `recipe_imports` — an import extracts an existing recipe from a
-- URL or a photo, this one invents one, and conflating them would make the
-- import screen's states meaningless.
-- ----------------------------------------------------------------------------
create table public.recipe_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- What the cook typed first. Kept verbatim for the "refazer" affordance.
  prompt text not null,
  equipment public.equipment_type[] not null default '{}',
  mode public.chef_mode not null default 'normal',
  servings smallint not null default 2 check (servings between 1 and 20),

  -- Every turn: {role: 'user' | 'assistant', content: text}. Append-only.
  turns jsonb not null default '[]'::jsonb,

  status public.import_status not null default 'pending',
  error_message text,

  -- Set once the draft has been materialised into `recipes`.
  recipe_id uuid references public.recipes (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipe_generations_user_idx
  on public.recipe_generations (user_id, created_at desc);

create trigger recipe_generations_set_updated_at
  before update on public.recipe_generations
  for each row execute function public.set_updated_at();

alter table public.recipe_generations enable row level security;

create policy "recipe_generations: own" on public.recipe_generations
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.recipe_generations is
  'One AI recipe conversation: the ask, the kitchen, the refinement turns, and the draft it produced.';
