-- ============================================================================
-- Meu Petit Chef — seed data
--
-- Mirrors the clickable prototype so the app has something real to render on
-- first run: one fully-detailed recipe (Lasanha de frango leve, 3 variants ×
-- 3 cooking paths × macro + micro steps) plus the nine catalogue recipes.
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING keyed on a natural key.
-- Run with:  supabase db push --include-seed     (or psql -f supabase/seed.sql)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Tags
-- ----------------------------------------------------------------------------
insert into public.tags (slug, label, kind) values
  ('air-fryer',      'Air Fryer',       'equipment'),
  ('leve',           'Leve',            'nutrition'),
  ('proteica',       'Proteica',        'nutrition'),
  ('rapida',         'Rápida',          'time'),
  ('brasileira',     'Cozinha brasileira', 'cuisine'),
  ('comfort-food',   'Comfort food',    'theme'),
  ('meal-prep',      'Meal prep',       'theme'),
  ('sobremesa',      'Sobremesa',       'course'),
  ('dia-a-dia',      'Dia a dia',       'theme')
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Ingredients — nutrition per 100 g / 100 ml.
-- Values are indicative (TACO / USDA order of magnitude) and flagged
-- is_verified = false until a nutritionist pass confirms them.
-- ----------------------------------------------------------------------------
insert into public.ingredients
  (slug, name, default_unit, default_unit_kind, grams_per_unit, kcal_100, protein_100,
   carbs_100, fat_100, fiber_100, allergens, aisle)
values
  ('peito-de-frango',    'Peito de frango',            'g',  'mass',   null, 165, 31.0,  0.0,  3.6, 0.0, '{}',            'acougue'),
  ('tilapia',            'Filé de tilápia',            'g',  'mass',   null,  96, 20.1,  0.0,  1.7, 0.0, '{peixe}',       'peixaria'),
  ('salmao',             'Salmão',                     'g',  'mass',   null, 208, 20.4,  0.0, 13.4, 0.0, '{peixe}',       'peixaria'),
  ('patinho-moido',      'Patinho moído',              'g',  'mass',   null, 133, 21.5,  0.0,  4.8, 0.0, '{}',            'acougue'),
  ('cebola',             'Cebola',                     'un.','count',   110,  40,  1.1,  9.3,  0.1, 1.7, '{}',            'hortifruti'),
  ('alho',               'Alho',                       'dentes','count',   3, 149,  6.4, 33.1,  0.5, 2.1, '{}',            'hortifruti'),
  ('abobrinha',          'Abobrinha',                  'un.','count',   200,  17,  1.2,  3.1,  0.3, 1.0, '{}',            'hortifruti'),
  ('tomate',             'Tomate',                     'un.','count',   120,  18,  0.9,  3.9,  0.2, 1.2, '{}',            'hortifruti'),
  ('pimentao',           'Pimentão',                   'un.','count',   150,  26,  1.0,  6.0,  0.3, 2.1, '{}',            'hortifruti'),
  ('cenoura',            'Cenoura',                    'un.','count',    90,  41,  0.9,  9.6,  0.2, 2.8, '{}',            'hortifruti'),
  ('batata',             'Batata',                     'un.','count',   150,  77,  2.0, 17.5,  0.1, 2.2, '{}',            'hortifruti'),
  ('manjericao',         'Manjericão fresco',          'folhas','count',   1,  23,  3.2,  2.7,  0.6, 1.6, '{}',            'hortifruti'),
  ('abacate',            'Abacate',                    'un.','count',   200, 160,  2.0,  8.5, 14.7, 6.7, '{}',            'hortifruti'),
  ('leite-desnatado',    'Leite desnatado',            'ml', 'volume',  null,  35,  3.4,  5.0,  0.1, 0.0, '{leite}',       'laticinios'),
  ('iogurte-natural',    'Iogurte natural desnatado',  'g',  'mass',    null,  56,  5.3,  7.0,  0.2, 0.0, '{leite}',       'laticinios'),
  ('requeijao-light',    'Requeijão light',            'g',  'mass',    null, 175,  9.0,  4.0, 13.0, 0.0, '{leite}',       'laticinios'),
  ('cottage',            'Queijo cottage',             'g',  'mass',    null,  98, 11.1,  3.4,  4.3, 0.0, '{leite}',       'laticinios'),
  ('parmesao',           'Parmesão ralado',            'g',  'mass',    null, 431, 38.5,  4.1, 29.0, 0.0, '{leite}',       'laticinios'),
  ('mussarela-light',    'Mussarela light',            'g',  'mass',    null, 254, 24.3,  3.0, 15.9, 0.0, '{leite}',       'laticinios'),
  ('creme-de-leite',     'Creme de leite',             'g',  'mass',    null, 195,  2.3,  4.0, 19.0, 0.0, '{leite}',       'laticinios'),
  ('ovo',                'Ovo',                        'un.','count',     50, 143, 12.6,  0.7,  9.5, 0.0, '{ovo}',         'laticinios'),
  ('molho-de-tomate',    'Molho de tomate',            'g',  'mass',    null,  32,  1.3,  7.0,  0.2, 1.4, '{}',            'mercearia'),
  ('massa-lasanha',      'Massa de lasanha pré-cozida','g',  'mass',    null, 359, 12.5, 71.0,  1.5, 3.2, '{gluten}',      'mercearia'),
  ('amido-de-milho',     'Amido de milho',             'c. sopa','spoon',  8, 381,  0.3, 91.3,  0.1, 0.9, '{}',            'mercearia'),
  ('azeite',             'Azeite de oliva',            'c. sopa','spoon', 13, 884,  0.0,  0.0,100.0, 0.0, '{}',            'mercearia'),
  ('noz-moscada',        'Noz-moscada',                'pitada','pinch',  0.3, 525,  5.8, 49.3, 36.3,20.8,'{}',            'mercearia'),
  ('sal',                'Sal',                        'pitada','pinch',  0.4,   0,  0.0,  0.0,  0.0, 0.0, '{}',           'mercearia'),
  ('polvilho-azedo',     'Polvilho azedo',             'g',  'mass',    null, 351,  0.3, 86.6,  0.1, 0.5, '{}',            'mercearia'),
  ('farinha-de-trigo',   'Farinha de trigo',           'g',  'mass',    null, 364, 10.3, 76.3,  1.0, 2.7, '{gluten}',      'mercearia'),
  ('acucar',             'Açúcar',                     'g',  'mass',    null, 387,  0.0,100.0,  0.0, 0.0, '{}',            'mercearia'),
  ('mandioca',           'Mandioca',                   'g',  'mass',    null, 160,  1.4, 38.1,  0.3, 1.8, '{}',            'hortifruti')
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Global substitution rules — the "fit" chef's toolbox.
-- ----------------------------------------------------------------------------
insert into public.ingredient_substitutions (ingredient_id, replacement_id, ratio, mode, reason, note)
select o.id, r.id, s.ratio, s.mode::public.chef_mode, s.reason, s.note
from (values
  ('creme-de-leite', 'iogurte-natural', 1.0,  'fit',      'Menos gordura, mesma cremosidade', 'Adicione fora do fogo para não talhar.'),
  ('creme-de-leite', 'cottage',         1.0,  'fit',      'Mais proteína, menos gordura',     'Bata no liquidificador até ficar liso.'),
  ('mussarela-light','parmesao',        0.4,  'fit',      'Menos queijo, mais sabor',         'Um queijo intenso rende mais com menos quantidade.'),
  ('creme-de-leite', 'requeijao-light', 1.0,  'gourmand', 'Textura mais rica',                null)
) as s(orig, repl, ratio, mode, reason, note)
join public.ingredients o on o.slug = s.orig
join public.ingredients r on r.slug = s.repl
on conflict (ingredient_id, replacement_id, mode) do nothing;

-- ============================================================================
-- Recipe 1 — Lasanha de frango leve (the fully modelled reference recipe)
-- ============================================================================
insert into public.recipes
  (slug, title, subtitle, description, author_name, cuisine, category, difficulty,
   total_minutes, active_minutes, default_servings, rating_avg, rating_count, status, published_at)
values
  ('lasanha-de-frango-leve',
   'Lasanha de frango leve',
   'Cozinha brasileira',
   'Uma lasanha de frango com molho branco de iogurte, camadas de abobrinha no lugar de parte da massa e gratinado no final. Funciona no Thermomix, na Air Fryer ou no forno tradicional.',
   'Petit Chef', 'Cozinha brasileira', 'Prato principal', 'medio',
   55, 25, 4, 4.7, 128, 'published', now())
on conflict (slug) do nothing;

insert into public.recipe_tags (recipe_id, tag_id)
select r.id, t.id
from public.recipes r
join public.tags t on t.slug in ('leve', 'proteica', 'brasileira', 'comfort-food')
where r.slug = 'lasanha-de-frango-leve'
on conflict do nothing;

-- Variants ------------------------------------------------------------------
insert into public.recipe_variants
  (recipe_id, mode, kcal, protein_g, carbs_g, fat_g, summary, changes, servings_factor)
select r.id, v.mode::public.chef_mode, v.kcal, v.protein, v.carbs, v.fat, v.summary, v.changes, v.factor
from public.recipes r
cross join (values
  ('normal', 640, 38, 52, 28,
   'A receita de referência, próxima da versão original.',
   array['Receita próxima da versão original', 'Porções para 4 pessoas'], 1.0),
  ('gourmand', 735, 58, 58, 31,
   'Mais frango, molho branco enriquecido e porções generosas.',
   array['Frango aumentado para 700 g', 'Requeijão e parmesão no molho branco', 'Porções 25% maiores'], 1.25),
  ('fit', 390, 44, 31, 12,
   'Manteiga fora, iogurte no lugar do creme e uma camada de massa trocada por abobrinha.',
   array['Manteiga removida', 'Creme substituído por iogurte natural', '250 kcal a menos', '6 g de proteína a mais'], 1.0)
) as v(mode, kcal, protein, carbs, fat, summary, changes, factor)
where r.slug = 'lasanha-de-frango-leve'
on conflict (recipe_id, mode) do nothing;

-- Ingredient groups ----------------------------------------------------------
insert into public.recipe_ingredient_groups (recipe_id, position, name)
select r.id, g.position, g.name
from public.recipes r
cross join (values (0, 'Molho branco'), (1, 'Recheio de frango'), (2, 'Montagem'))
  as g(position, name)
where r.slug = 'lasanha-de-frango-leve'
on conflict (recipe_id, position) do nothing;

insert into public.recipe_ingredients
  (recipe_id, group_id, ingredient_id, position, display_name, quantity, unit, unit_kind, note, is_scalable)
select
  r.id,
  g.id,
  i.id,
  x.position,
  x.display_name,
  x.quantity,
  x.unit,
  x.unit_kind::public.unit_kind,
  x.note,
  x.scalable
from public.recipes r
cross join (values
  -- Molho branco
  ('Molho branco',      'leite-desnatado',  0, 'Leite desnatado',              500,   'ml',      'volume', null,                              true),
  ('Molho branco',      'amido-de-milho',   1, 'Amido de milho',                 2,   'c. sopa', 'spoon',  null,                              true),
  ('Molho branco',      'iogurte-natural',  2, 'Iogurte natural',              120,   'g',       'mass',   'no lugar do creme de leite',      true),
  ('Molho branco',      'noz-moscada',      3, 'Noz-moscada',                    1,   'pitada',  'pinch',  null,                              false),
  ('Molho branco',      'parmesao',         4, 'Parmesão ralado',               30,   'g',       'mass',   null,                              true),
  -- Recheio
  ('Recheio de frango', 'peito-de-frango',  0, 'Peito de frango desfiado',     500,   'g',       'mass',   null,                              true),
  ('Recheio de frango', 'cebola',           1, 'Cebola',                         1,   'un.',     'count',  'picada',                          true),
  ('Recheio de frango', 'alho',             2, 'Alho',                           2,   'dentes',  'count',  null,                              true),
  ('Recheio de frango', 'molho-de-tomate',  3, 'Molho de tomate',              400,   'g',       'mass',   null,                              true),
  ('Recheio de frango', 'azeite',           4, 'Azeite',                         1,   'c. sopa', 'spoon',  null,                              true),
  ('Recheio de frango', 'manjericao',       5, 'Manjericão fresco',              6,   'folhas',  'count',  null,                              true),
  -- Montagem
  ('Montagem',          'massa-lasanha',    0, 'Massa de lasanha pré-cozida',  250,   'g',       'mass',   null,                              true),
  ('Montagem',          'abobrinha',        1, 'Abobrinha em fatias finas',      1,   'un.',     'count',  'substitui uma camada de massa',   true),
  ('Montagem',          'mussarela-light',  2, 'Mussarela light',              120,   'g',       'mass',   null,                              true)
) as x(group_name, ingredient_slug, position, display_name, quantity, unit, unit_kind, note, scalable)
join public.recipe_ingredient_groups g on g.recipe_id = r.id and g.name = x.group_name
left join public.ingredients i on i.slug = x.ingredient_slug
where r.slug = 'lasanha-de-frango-leve'
  and not exists (
    select 1 from public.recipe_ingredients ri
    where ri.recipe_id = r.id and ri.display_name = x.display_name
  );

-- How the fit variant rewrites the base list --------------------------------
insert into public.recipe_variant_ingredients
  (variant_id, recipe_ingredient_id, display_name, quantity, unit, unit_kind, note)
select v.id, ri.id, x.display_name, x.quantity, x.unit, x.unit_kind::public.unit_kind, x.note
from public.recipes r
cross join (values
  ('Mussarela light', 'Mussarela light',  80, 'g', 'mass', 'quantidade reduzida, sabor mantido pelo parmesão'),
  ('Massa de lasanha pré-cozida', 'Massa de lasanha pré-cozida', 180, 'g', 'mass', 'uma camada trocada por abobrinha')
) as x(base_name, display_name, quantity, unit, unit_kind, note)
join public.recipe_variants v on v.recipe_id = r.id and v.mode = 'fit'
join public.recipe_ingredients ri on ri.recipe_id = r.id and ri.display_name = x.base_name
where r.slug = 'lasanha-de-frango-leve'
on conflict (variant_id, recipe_ingredient_id) do nothing;

insert into public.recipe_variant_ingredients (variant_id, recipe_ingredient_id, quantity, unit, unit_kind)
select v.id, ri.id, 700, 'g', 'mass'
from public.recipes r
join public.recipe_variants v on v.recipe_id = r.id and v.mode = 'gourmand'
join public.recipe_ingredients ri on ri.recipe_id = r.id and ri.display_name = 'Peito de frango desfiado'
where r.slug = 'lasanha-de-frango-leve'
on conflict (variant_id, recipe_ingredient_id) do nothing;

-- Notes ----------------------------------------------------------------------
insert into public.recipe_notes (recipe_id, kind, title, body, position)
select r.id, x.kind, x.title, x.body, x.position
from public.recipes r
cross join (values
  ('tip',      'Deixe descansar',   'Cortar a lasanha quente desmancha as camadas. Dez minutos de descanso resolvem.', 0),
  ('storage',  'Conservação',       'Até 3 dias na geladeira em pote fechado. Congela bem por 2 meses, já porcionada.', 1),
  ('allergen', 'Alérgenos',         'Contém leite e glúten. A versão sem glúten funciona com massa de arroz.', 2),
  ('substitution', 'Sem iogurte?',  'Cottage batido com um pouco de leite dá a mesma cremosidade.', 3)
) as x(kind, title, body, position)
where r.slug = 'lasanha-de-frango-leve'
  and not exists (
    select 1 from public.recipe_notes n where n.recipe_id = r.id and n.title = x.title
  );

-- Cooking paths --------------------------------------------------------------
insert into public.cooking_paths
  (recipe_id, slug, name, required_equipment, total_minutes, active_minutes,
   is_recommended, reason, vessel_count, position)
select r.id, p.slug, p.name, p.equipment::public.equipment_type[], p.total, p.active,
       p.recommended, p.reason, p.vessels, p.position
from public.recipes r
cross join (values
  ('tmx',  'Thermomix + Forno',           '{thermomix,oven,none}',        55, 20, true,
   'Mais rápido, menos louça e melhor textura no molho.', 2, 0),
  ('af',   'Air Fryer + Fogão',           '{stovetop,air_fryer,none}',    45, 25, false,
   'Para quem não tem forno grande: tudo em forma pequena.', 3, 1),
  ('trad', 'Forno + Fogão (tradicional)', '{stovetop,oven,none}',         60, 30, false,
   'A rota clássica, sem equipamento especial.', 3, 2)
) as p(slug, name, equipment, total, active, recommended, reason, vessels, position)
where r.slug = 'lasanha-de-frango-leve'
on conflict (recipe_id, slug) do nothing;

-- Macro steps (the readable recipe card) -------------------------------------
insert into public.cooking_steps
  (path_id, position, is_micro, verb, instruction, equipment, duration_seconds, timer_enabled, alert_text)
select cp.id, s.position, false, s.verb, s.instruction, s.equipment::public.equipment_type,
       s.seconds, s.seconds is not null, s.alert
from public.recipes r
cross join (values
  -- Thermomix + forno
  ('tmx', 0, 'Triturar',  'Adicione a cebola e o alho no copo.',                        'thermomix',    5,    null),
  ('tmx', 1, 'Refogar',   'Junte o azeite e refogue.',                                  'thermomix',  180,    null),
  ('tmx', 2, 'Cozinhar',  'Adicione o frango desfiado e o molho de tomate.',             'thermomix',  480,    'Prove e ajuste o sal antes de continuar.'),
  ('tmx', 3, 'Engrossar', 'Adicione o leite, o amido e a noz-moscada.',                  'thermomix',  420,    null),
  ('tmx', 4, 'Montar',    'Monte as camadas: molho, massa, frango e abobrinha.',         'none',      null,    null),
  ('tmx', 5, 'Assar',     'Leve ao forno coberto com papel-alumínio.',                   'oven',      1500,    'Gire a forma na metade do tempo para dourar por igual.'),
  ('tmx', 6, 'Gratinar',  'Retire o alumínio e gratine.',                                'oven',       300,    null),
  ('tmx', 7, 'Descansar', 'Deixe descansar antes de cortar.',                            'none',       600,    null),
  -- Air fryer + fogão
  ('af',  0, 'Refogar',   'Adicione a cebola, o alho e o frango na panela.',              'stovetop',   480,    'Mexa regularmente para não queimar.'),
  ('af',  1, 'Reduzir',   'Junte o molho de tomate e reduza.',                            'stovetop',   420,    null),
  ('af',  2, 'Engrossar', 'Adicione o leite e o amido, mexendo sempre.',                  'stovetop',   360,    null),
  ('af',  3, 'Preaquecer','Preaqueça a Air Fryer.',                                       'air_fryer',  180,    null),
  ('af',  4, 'Assar',     'Monte em forma pequena e leve à Air Fryer.',                   'air_fryer', 1080,    'Vire a forma na metade do tempo.'),
  ('af',  5, 'Descansar', 'Deixe descansar antes de cortar.',                             'none',       480,    null),
  -- Tradicional
  ('trad',0, 'Refogar',   'Adicione a cebola, o alho e o frango na panela.',              'stovetop',   600,    'Mexa regularmente para não queimar.'),
  ('trad',1, 'Reduzir',   'Junte o molho de tomate e o manjericão.',                      'stovetop',   600,    null),
  ('trad',2, 'Engrossar', 'Adicione o leite e o amido, mexendo sempre.',                  'stovetop',   420,    null),
  ('trad',3, 'Montar',    'Monte as camadas na travessa.',                                'none',      null,    null),
  ('trad',4, 'Assar',     'Leve ao forno coberto.',                                       'oven',      1800,    'Cubra com alumínio se dourar rápido.'),
  ('trad',5, 'Gratinar',  'Gratine sem cobertura.',                                       'oven',       480,    null)
) as s(path, position, verb, instruction, equipment, seconds, alert)
join public.cooking_paths cp on cp.recipe_id = r.id and cp.slug = s.path
where r.slug = 'lasanha-de-frango-leve'
on conflict (path_id, is_micro, position) do nothing;

-- Dials on the macro steps ---------------------------------------------------
insert into public.cooking_step_dials (step_id, position, kind, value_num, value_text, sub_label)
select st.id, d.position, d.kind::public.dial_kind, d.value_num, d.value_text, d.sub
from public.recipes r
cross join (values
  ('tmx', 0, 0, 'velocidade',  5,    '5',              null),
  ('tmx', 1, 0, 'temperatura', 120,  '120 °C',         null),
  ('tmx', 1, 1, 'velocidade',  1,    '1',              'Inverso'),
  ('tmx', 2, 0, 'temperatura', 100,  '100 °C',         null),
  ('tmx', 2, 1, 'velocidade',  1,    '1',              'Inverso'),
  ('tmx', 3, 0, 'temperatura', 90,   '90 °C',          null),
  ('tmx', 3, 1, 'velocidade',  3,    '3',              null),
  ('tmx', 5, 0, 'temperatura', 180,  '180 °C',         null),
  ('tmx', 5, 1, 'modo',        null, 'Ventilado',      'Grade 2'),
  ('tmx', 6, 0, 'temperatura', 220,  '220 °C',         null),
  ('tmx', 6, 1, 'modo',        null, 'Grill',          'Grade 3'),
  ('af',  0, 0, 'potencia',    6,    'Médio',          'Nível 6/9'),
  ('af',  1, 0, 'potencia',    4,    'Médio-baixo',    'Nível 4/9'),
  ('af',  2, 0, 'potencia',    2,    'Baixo',          'Nível 2/9'),
  ('af',  3, 0, 'temperatura', 190,  '190 °C',         null),
  ('af',  4, 0, 'temperatura', 190,  '190 °C',         null),
  ('trad',0, 0, 'potencia',    6,    'Médio',          'Nível 6/9'),
  ('trad',1, 0, 'potencia',    4,    'Médio-baixo',    'Nível 4/9'),
  ('trad',2, 0, 'potencia',    2,    'Baixo',          'Nível 2/9'),
  ('trad',4, 0, 'temperatura', 180,  '180 °C',         null),
  ('trad',4, 1, 'modo',        null, 'Convecção',      'Grade 2'),
  ('trad',5, 0, 'temperatura', 200,  '200 °C',         null),
  ('trad',5, 1, 'modo',        null, 'Ventilado',      'Grade 3')
) as d(path, step, position, kind, value_num, value_text, sub)
join public.cooking_paths cp on cp.recipe_id = r.id and cp.slug = d.path
join public.cooking_steps st on st.path_id = cp.id and st.is_micro = false and st.position = d.step
where r.slug = 'lasanha-de-frango-leve'
on conflict (step_id, kind) do nothing;

-- ============================================================================
-- Recipes 2-10 — the catalogue. Header + normal variant + one cooking path,
-- enough for lists, search and filters to be exercised end to end.
-- ============================================================================
insert into public.recipes
  (slug, title, subtitle, author_name, cuisine, category, difficulty,
   total_minutes, active_minutes, default_servings, rating_avg, rating_count, status, published_at)
values
  ('frango-com-legumes-air-fryer', 'Frango com legumes na Air Fryer', 'Rápida e completa', 'Petit Chef', 'Cozinha brasileira', 'Prato principal', 'facil', 25, 12, 2, 4.6,  84, 'published', now()),
  ('salmao-com-legumes',           'Salmão com legumes',              'Forno, uma assadeira só', 'Petit Chef', 'Cozinha mediterrânea', 'Prato principal', 'facil', 30, 15, 2, 4.8,  61, 'published', now()),
  ('escondidinho-de-carne-light',  'Escondidinho de carne light',     'Comfort food mais leve', 'Petit Chef', 'Cozinha brasileira', 'Prato principal', 'medio', 45, 20, 4, 4.5,  47, 'published', now()),
  ('strogonoff-de-frango',         'Strogonoff de frango',            'Clássico de meio de semana', 'Petit Chef', 'Cozinha brasileira', 'Prato principal', 'facil', 28, 20, 3, 4.7, 132, 'published', now()),
  ('tilapia-com-legumes',          'Tilápia com legumes',             'Só a Air Fryer', 'Petit Chef', 'Cozinha brasileira', 'Prato principal', 'facil', 22, 12, 2, 4.4,  39, 'published', now()),
  ('coxinha-na-air-fryer',         'Coxinha na Air Fryer',            'Sem fritura', 'Petit Chef', 'Cozinha brasileira', 'Salgado', 'medio', 40, 25, 6, 4.6,  95, 'published', now()),
  ('pao-de-queijo',                'Pão de queijo',                   'Da massa ao forno', 'Petit Chef', 'Cozinha brasileira', 'Padaria', 'facil', 35, 10, 8, 4.9, 210, 'published', now()),
  ('bolo-de-cenoura',              'Bolo de cenoura',                 'Com cobertura de chocolate', 'Petit Chef', 'Cozinha brasileira', 'Sobremesa', 'facil', 50, 15, 8, 4.8, 176, 'published', now()),
  ('frango-a-parmegiana',          'Frango à parmegiana',             'Air Fryer + forno', 'Petit Chef', 'Cozinha brasileira', 'Prato principal', 'medio', 45, 25, 4, 4.7, 154, 'published', now())
on conflict (slug) do nothing;

insert into public.recipe_variants (recipe_id, mode, kcal, protein_g, carbs_g, fat_g, summary)
select r.id, 'normal', v.kcal, v.protein, v.carbs, v.fat, 'Versão de referência.'
from (values
  ('frango-com-legumes-air-fryer', 420, 41, 22, 18),
  ('salmao-com-legumes',           465, 39, 18, 26),
  ('escondidinho-de-carne-light',  510, 35, 48, 19),
  ('strogonoff-de-frango',         480, 37, 26, 25),
  ('tilapia-com-legumes',          360, 38, 16, 14),
  ('coxinha-na-air-fryer',         290, 16, 32, 11),
  ('pao-de-queijo',                180,  6, 20,  8),
  ('bolo-de-cenoura',              245,  5, 41,  7),
  ('frango-a-parmegiana',          590, 46, 38, 28)
) as v(slug, kcal, protein, carbs, fat)
join public.recipes r on r.slug = v.slug
on conflict (recipe_id, mode) do nothing;

insert into public.cooking_paths
  (recipe_id, slug, name, required_equipment, total_minutes, is_recommended, position)
select r.id, 'default', p.name, p.equipment::public.equipment_type[], r.total_minutes, true, 0
from (values
  ('frango-com-legumes-air-fryer', 'Air Fryer',        '{air_fryer,none}'),
  ('salmao-com-legumes',           'Forno',            '{oven,none}'),
  ('escondidinho-de-carne-light',  'Forno + Fogão',    '{stovetop,oven,none}'),
  ('strogonoff-de-frango',         'Fogão',            '{stovetop,none}'),
  ('tilapia-com-legumes',          'Air Fryer',        '{air_fryer,none}'),
  ('coxinha-na-air-fryer',         'Air Fryer',        '{air_fryer,stovetop,none}'),
  ('pao-de-queijo',                'Forno',            '{oven,none}'),
  ('bolo-de-cenoura',              'Forno',            '{oven,none}'),
  ('frango-a-parmegiana',          'Air Fryer + Forno','{air_fryer,oven,stovetop,none}')
) as p(slug, name, equipment)
join public.recipes r on r.slug = p.slug
on conflict (recipe_id, slug) do nothing;

insert into public.recipe_tags (recipe_id, tag_id)
select r.id, t.id
from (values
  ('frango-com-legumes-air-fryer', 'air-fryer'),
  ('frango-com-legumes-air-fryer', 'rapida'),
  ('tilapia-com-legumes',          'air-fryer'),
  ('tilapia-com-legumes',          'leve'),
  ('coxinha-na-air-fryer',         'air-fryer'),
  ('salmao-com-legumes',           'leve'),
  ('strogonoff-de-frango',         'dia-a-dia'),
  ('escondidinho-de-carne-light',  'comfort-food'),
  ('pao-de-queijo',                'brasileira'),
  ('bolo-de-cenoura',              'sobremesa'),
  ('frango-a-parmegiana',          'brasileira')
) as x(recipe_slug, tag_slug)
join public.recipes r on r.slug = x.recipe_slug
join public.tags t on t.slug = x.tag_slug
on conflict do nothing;

commit;
