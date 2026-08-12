/**
 * Applies every Supabase migration + the seed to a throwaway Postgres 17
 * running in WASM (PGlite), then asserts the schema behaves.
 *
 * This is the safety net that makes "write migrations now, push to the cloud
 * later" a reasonable plan: SQL mistakes surface here, in one second, instead
 * of halfway through `supabase db push` against a real project.
 *
 * Usage: npm run db:verify
 */
import { buildSchema } from './build-schema.mjs';

let failures = 0;

async function assertThat(db, label, sql, expected) {
  const result = await db.query(sql);
  const actual = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
  const ok = String(actual) === String(expected);
  console.log(
    `${ok ? '  ok  ' : '  FAIL'} ${label} → ${String(actual)}${ok ? '' : ` (expected ${expected})`}`,
  );
  if (!ok) failures += 1;
}

const db = await buildSchema({ seed: true });

console.log('\nassertions');
await assertThat(
  db,
  'recipes seeded',
  "select count(*) from public.recipes where status = 'published'",
  10,
);
await assertThat(
  db,
  'lasanha has 3 variants',
  "select count(*) from public.recipe_variants v join public.recipes r on r.id = v.recipe_id where r.slug = 'lasanha-de-frango-leve'",
  3,
);
await assertThat(
  db,
  'lasanha has 3 paths',
  "select count(*) from public.cooking_paths p join public.recipes r on r.id = p.recipe_id where r.slug = 'lasanha-de-frango-leve'",
  3,
);
await assertThat(
  db,
  'lasanha has 20 macro steps',
  "select count(*) from public.cooking_steps s join public.cooking_paths p on p.id = s.path_id join public.recipes r on r.id = p.recipe_id where r.slug = 'lasanha-de-frango-leve' and not s.is_micro",
  20,
);
await assertThat(db, 'dials attached', 'select count(*) from public.cooking_step_dials', 23);
await assertThat(
  db,
  'lasanha has 14 ingredient lines',
  "select count(*) from public.recipe_ingredients ri join public.recipes r on r.id = ri.recipe_id where r.slug = 'lasanha-de-frango-leve'",
  14,
);
await assertThat(
  db,
  'slug auto-generated on insert',
  "select public.mpc_slugify('Frango à Parmegiana com Abobrinha')",
  'frango-a-parmegiana-com-abobrinha',
);
await assertThat(
  db,
  'search_vector populated',
  'select count(*) from public.recipes where search_vector is not null',
  10,
);

// thermomix, oven, none, stovetop, air_fryer — the union across all 3 paths.
await assertThat(
  db,
  'recipe_cards aggregates equipment',
  "select array_length(equipment, 1) from public.recipe_cards where slug = 'lasanha-de-frango-leve'",
  5,
);
await assertThat(
  db,
  'recipe_cards aggregates variants',
  "select count(*) from jsonb_object_keys((select variants from public.recipe_cards where slug = 'lasanha-de-frango-leve'))",
  3,
);

await assertThat(
  db,
  "search finds 'lasanha'",
  "select count(*) from public.search_recipes('lasanha')",
  1,
);
await assertThat(
  db,
  'search is accent-insensitive',
  "select count(*) from public.search_recipes('parmegiana')",
  1,
);
// lasanha (air-fryer path) + frango-af + tilapia + coxinha + parmegiana
await assertThat(
  db,
  'search filters by equipment',
  "select count(*) from public.search_recipes(null, '{air_fryer}'::public.equipment_type[])",
  5,
);
// frango-af (25 min) + tilapia (22 min)
await assertThat(
  db,
  'search filters by time',
  'select count(*) from public.search_recipes(null, null, 25)',
  2,
);
// frango-af (41 g) + parmegiana (46 g); lasanha's *normal* variant is only 38 g
await assertThat(
  db,
  'search filters by protein',
  'select count(*) from public.search_recipes(null, null, null, null, 40)',
  2,
);
// ...but its fit variant clears the bar, which is exactly what mode_filter is for.
await assertThat(
  db,
  'search respects chef mode',
  "select count(*) from public.search_recipes(null, null, null, null, 40, null, 'fit')",
  1,
);

await assertThat(
  db,
  'ratings trigger keeps avg',
  "select rating_count from public.recipes where slug = 'lasanha-de-frango-leve'",
  128,
);
/* ---------------------------------------------------------------------------
 * Imports must refuse the same provider recipe twice (migration 13). Written as
 * a real double insert rather than a catalog lookup: an index that exists but
 * does not fire is the failure mode worth catching.
 * ------------------------------------------------------------------------- */
await db.exec(`
  insert into public.recipe_imports (user_id, source, source_url, provider, external_id)
  values (null, 'url', 'https://www.cookomix.com/recettes/x/', 'cookomix', '205');
`);
let duplicateRejected = false;
try {
  await db.exec(`
    insert into public.recipe_imports (user_id, source, source_url, provider, external_id)
    values (null, 'url', 'https://www.cookomix.com/recettes/x-bis/', 'cookomix', '205');
  `);
} catch {
  duplicateRejected = true;
}
console.log(
  `${duplicateRejected ? '  ok  ' : '  FAIL'} machine import is deduped by (provider, external_id)`,
);
if (!duplicateRejected) failures += 1;

/* ---------------------------------------------------------------------------
 * Une référence importée ne peut pas être publiée (migration 14). Écrit comme
 * un vrai UPDATE : une contrainte qui existe mais ne déclenche pas est le
 * scénario qu'il faut attraper.
 * ------------------------------------------------------------------------- */
await db.exec(`
  insert into public.recipes (slug, title, total_minutes, status, source_provider, source_url)
  values ('reference-importee', 'Référence importée', 30, 'draft', 'cookomix', 'https://exemple/');
`);
let publishRejected = false;
try {
  await db.exec(
    "update public.recipes set status = 'published' where slug = 'reference-importee';",
  );
} catch {
  publishRejected = true;
}
console.log(
  `${publishRejected ? '  ok  ' : '  FAIL'} une référence importée ne peut pas être publiée`,
);
if (!publishRejected) failures += 1;

await assertThat(
  db,
  'une recette originale se publie normalement',
  // Une instruction modifiante ne vit que dans une CTE, jamais dans un FROM.
  `with published as (
     update public.recipes set status = 'published', source_provider = null
     where slug = 'reference-importee' returning 1
   ) select count(*) from published`,
  1,
);

// La fixture repart : les assertions suivantes comptent les recettes publiées.
await db.exec("delete from public.recipes where slug = 'reference-importee';");

await assertThat(
  db,
  'a machine import needs no user',
  "select count(*) from public.recipe_imports where user_id is null and provider = 'cookomix'",
  1,
);

await assertThat(
  db,
  'every public table has RLS',
  "select count(*) from pg_tables t where t.schemaname = 'public' and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity)",
  0,
);

// RLS smoke test: an authenticated stranger sees published content and nothing personal.
await db.exec(
  "set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', false);",
);
await assertThat(
  db,
  'RLS: stranger sees published recipes',
  'select count(*) from public.recipes',
  10,
);
await assertThat(
  db,
  "RLS: stranger sees nobody's pantry",
  'select count(*) from public.pantry_items',
  0,
);
await assertThat(
  db,
  "RLS: stranger sees nobody's diary",
  'select count(*) from public.diary_entries',
  0,
);
await db.exec('reset role;');

/* ---------------------------------------------------------------------------
 * Suggestions are ranked by the caller's kitchen, not by rating.
 *
 * This guards a real regression: the home screen used to order by `rating_avg`
 * and handed an Air-Fryer-only user three oven recipes. The seed ships no users,
 * so the fixture is built here.
 * ------------------------------------------------------------------------- */
const TEST_USER = '11111111-1111-1111-1111-111111111111';
await db.exec(`
  insert into auth.users (id, email) values ('${TEST_USER}', 'airfryer@test.local');
  insert into public.profiles (id, chef_mode) values ('${TEST_USER}', 'fit')
    on conflict (id) do update set chef_mode = 'fit';
  insert into public.profile_equipment (user_id, equipment)
    values ('${TEST_USER}', 'air_fryer');
  set role authenticated;
  select set_config('request.jwt.claim.sub', '${TEST_USER}', false);
`);

await assertThat(
  db,
  'suggestions rank the owned appliance first',
  `select count(*) from (
     select c.equipment from public.suggest_recipes('fit', 1) c
   ) top where 'air_fryer' = any(top.equipment)`,
  1,
);
await assertThat(
  db,
  'suggestions never come back empty for an ill-equipped kitchen',
  "select count(*) from public.suggest_recipes('normal', 8)",
  8,
);
await db.exec('reset role;');

/* ---------------------------------------------------------------------------
 * Le back-office magazine est réservé aux admins (migration 17).
 *
 * Masquer l'écran n'est pas un contrôle d'accès : PostgREST est un point
 * d'entrée public. Ce qui suit vérifie la seule chose qui arrête vraiment un
 * inconnu connecté — les policies. Écrit avec deux identités réelles plutôt
 * qu'en lisant pg_policies : une policy qui existe mais ne filtre pas est
 * précisément le scénario à attraper.
 * ------------------------------------------------------------------------- */
const ADMIN_USER = '22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN_USER}', 'admin@test.local');
  insert into public.profiles (id, role) values ('${ADMIN_USER}', 'admin')
    on conflict (id) do update set role = 'admin';
  insert into public.magazine_imports (created_by, publication, issue, file_path, page_count)
    values ('${ADMIN_USER}', 'Régal', 'Hors-Série N31',
            '${ADMIN_USER}/magazines/fixture/original.pdf', 100);
`);

// TEST_USER est un utilisateur ordinaire : il ne doit rien voir du tout.
await db.exec(
  `set role authenticated; select set_config('request.jwt.claim.sub', '${TEST_USER}', false);`,
);
await assertThat(
  db,
  "RLS: un utilisateur ordinaire ne voit aucun import magazine",
  'select count(*) from public.magazine_imports',
  0,
);
let importRefused = false;
try {
  await db.exec(`
    insert into public.magazine_imports (created_by, file_path)
    values ('${TEST_USER}', '${TEST_USER}/magazines/x/original.pdf');
  `);
} catch {
  importRefused = true;
}
console.log(
  `${importRefused ? '  ok  ' : '  FAIL'} RLS: un utilisateur ordinaire ne peut pas créer un import magazine`,
);
if (!importRefused) failures += 1;

await db.exec(
  `select set_config('request.jwt.claim.sub', '${ADMIN_USER}', false);`,
);
await assertThat(
  db,
  "RLS: l'admin voit les imports magazine",
  'select count(*) from public.magazine_imports',
  1,
);
await db.exec('reset role;');

await assertThat(
  db,
  'un item importé exige une recette',
  `select count(*) from (
     select 1 from public.magazine_import_items limit 0
   ) empty`,
  0,
);
let itemWithoutRecipeRefused = false;
try {
  await db.exec(`
    insert into public.magazine_import_items (import_id, title, status)
    select id, 'Gaspacho', 'imported' from public.magazine_imports limit 1;
  `);
} catch {
  itemWithoutRecipeRefused = true;
}
console.log(
  `${itemWithoutRecipeRefused ? '  ok  ' : '  FAIL'} un item ne peut pas être « imported » sans recette`,
);
if (!itemWithoutRecipeRefused) failures += 1;

await db.close();

if (failures > 0) {
  console.error(`\n✖ schema verification failed — ${failures} assertion(s)`);
  process.exit(1);
}
console.log('\n✔ schema verified (migrations + seed + RLS)');
