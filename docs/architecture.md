# Décisions d'architecture — Meu Petit Chef

Ce document explique _pourquoi_ l'infrastructure est faite ainsi. Le README dit
comment la faire tourner ; celui-ci dit ce qu'on a arbitré et ce qu'on a refusé.

---

## 1. Le modèle de données

### Une recette n'est pas une liste d'étapes

C'est la décision structurante. Une recette est **N routes alternatives vers le
même plat**, une par combinaison d'appareils plausible :

```
recipes
├── recipe_variants            ×3   (normal / gourmand / fit)
│   ├── recipe_variant_ingredients        réécritures de la liste de base
│   └── recipe_variant_extra_ingredients  ajouts propres à la variante
├── recipe_ingredient_groups   "Molho branco", "Recheio", "Montagem"
│   └── recipe_ingredients
└── cooking_paths              ×N   ("Thermomix + Forno", "Air Fryer + Fogão"…)
    └── cooking_steps
        ├── cooking_step_dials             tempo / temperatura / velocidade…
        ├── cooking_step_ingredients       quels ingrédients l'étape touche
        └── cooking_step_equipment_specs   4 L vs 8 L d'air fryer
```

Le produit peut alors répondre à « je n'ai pas de Thermomix » sans qu'aucune IA
n'invente quoi que ce soit : la route existe déjà, validée, en base.

### Deux granularités d'étapes sur la même table

`cooking_steps.is_micro` distingue :

- `false` — l'étape lisible de la fiche (« Leve ao forno coberto ») ;
- `true` — l'action unique par écran du mode guidé (« Adicionar 2 dentes de alho »).

Une seule table, un index unique sur `(path_id, is_micro, position)`. Si une
recette n'a pas de micro-étapes, le mode cuisine retombe sur les étapes lisibles
— jamais d'écran vide.

### Les variantes réécrivent, elles ne dupliquent pas

`recipe_variant_ingredients` ne contient que les **différences**. La version
_Original_ n'a donc aucune ligne : c'est la liste de base telle quelle. Corriger
une quantité de base corrige les trois versions d'un coup.

### La nutrition vient des ingrédients

`ingredients` porte les valeurs pour 100 g / 100 ml, plus `grams_per_unit`
(« 1 cebola = 110 g ») et `grams_per_ml`. Sans ces facteurs de conversion, les
calories d'une recette sont une estimation à la main — exactement le risque n°3
du document de concept.

### `equipment_type.none` est un type d'étape

Monter, réserver, laisser reposer : ce sont de vraies étapes, sans appareil.
`visibleEquipment()` les filtre à l'affichage des prérequis.

### Périmètre complet dès le départ

Le prototype montre déjà despensa, plan de repas, courses, diário et meal prep.
Poser ces 8 tables maintenant coûte une migration ; les poser dans six mois
coûte une migration **plus** une reprise de données.

---

## 2. Sécurité

### RLS partout, sans exception

Les 33 tables ont `enable row level security`. Une table sans policy est en
deny-all, ce qui est le bon défaut quand on en oublie une. `db:verify` assère
qu'aucune table du schéma `public` n'a RLS désactivé — la vérification est
automatique, pas une discipline.

Deux formes seulement :

- **contenu** — lecture publique si `status = 'published'`, écriture réservée
  aux `editor` / `admin` ;
- **utilisateur** — le propriétaire lit et écrit ses lignes, personne d'autre.

Les tables enfants passent par `recipe_is_visible()` / `path_is_visible()` /
`variant_is_visible()`, en `SECURITY DEFINER`, pour que la règle de visibilité
vive à un seul endroit et ne récursse pas dans les policies.

### Les vues sont `security_invoker`

`recipe_cards` est déclarée `with (security_invoker = on)`. Sans cela, une vue
s'exécute avec les droits de son propriétaire et devient un trou autour du RLS.

### Buckets Storage

| Bucket          | Lecture      | Écriture                    |
| --------------- | ------------ | --------------------------- |
| `recipe-images` | publique     | éditeurs                    |
| `avatars`       | publique     | propriétaire, dans `{uid}/` |
| `imports`       | propriétaire | propriétaire, dans `{uid}/` |

Les imports sont des documents personnels (photos de livres, PDF) : privés.

---

## 3. Pourquoi PGlite

Docker n'est pas installé sur la machine, donc ni `supabase start` ni
`supabase gen types --db-url` ne fonctionnent (les deux passent par un
conteneur). Trois options s'offraient : installer Docker, écrire les types à la
main, ou trouver un Postgres sans conteneur.

**PGlite** est Postgres 17 compilé en WebAssembly. `scripts/build-schema.mjs`
recrée les schémas que Supabase fournit (`auth`, `storage`, `auth.uid()`, les
rôles `anon`/`authenticated`) puis applique les 11 migrations. À partir de là :

- `db:verify` rejoue schéma + seed et vérifie 21 invariants — dont un test RLS
  qui prend l'identité d'un inconnu et vérifie qu'il ne voit ni garde-manger ni
  journal ;
- `db:types` introspecte `pg_catalog` et écrit `database.types.ts`, y compris
  les `Relationships` issues des clés étrangères et les colonnes des fonctions
  `RETURNS TABLE`.

Le bénéfice réel : une erreur SQL est détectée en une seconde, en local, au lieu
d'être découverte au milieu d'un `db push` contre un vrai projet.

---

## 4. Choix front-end

### Vite plutôt que Next.js

Le produit est une PWA installée, hors-ligne, mono-utilisateur, sans SEO à
défendre : le SSR ne sert à rien et alourdirait le déploiement. C'est aussi la
pile nommée dans le document de concept.

### Tailwind v4 en `@theme inline`

Les tokens Signal Noir sont copiés tels quels dans `src/styles/tokens/` et
exposés à Tailwind **par référence** (`@theme inline`). Conséquence : changer
`data-theme="porcelain"` en `graphite` re-thème toutes les utilitaires à
l'exécution, sans rebuild et sans palette dupliquée. Aucun hexadécimal n'est
écrit en dur dans un composant.

### Le minuteur ne compte pas, il regarde l'heure

`useTimerStore` stocke un **instant d'échéance absolu**, pas un compteur
décrémenté. Une PWA en arrière-plan voit ses `setInterval` gelés ou throttlés :
un minuteur de four qui aurait perdu quatre minutes parce que l'écran s'est
verrouillé est pire que pas de minuteur. L'intervalle ne sert qu'à déclencher le
rendu ; l'horloge est la source de vérité. C'est testé, en simulant un onglet
suspendu.

### Persistance IndexedDB, pas localStorage

`PersistQueryClientProvider` sauvegarde le cache TanStack Query dans IndexedDB
via `idb-keyval` : asynchrone et sans limite de 5 Mo. Seules les requêtes
**réussies** sont réhydratées — persister un échec ferait ressusciter un écran
d'erreur sans réseau.

### Le mode cuisine sort du shell

`/receita/:slug/cozinhar` est routé **hors** de `<AppShell>` : pas de tab bar à
toucher par mégarde en remuant, et la couleur de l'appareil occupe tout l'écran.

### Mise à jour du service worker : `prompt`, pas `autoUpdate`

Recharger la page sous quelqu'un qui est à l'étape 6 sur 11 avec un minuteur en
cours serait hostile. `<UpdatePrompt>` propose, l'utilisateur décide.

### `exactOptionalPropertyTypes` est désactivé

Seul assouplissement au `strict` complet. supabase-js déclare ses options en
`key?: T` et non `key?: T | undefined` ; passer explicitement `undefined` — ce
qui est la façon naturelle d'exprimer un filtre optionnel — serait une erreur de
type à presque chaque appel de repository. Tout le reste
(`noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`…) est
actif.

### Toutes les réponses PostgREST passent par `unwrap()`

Aucun appel ne peut oublier de vérifier `error`, et les codes Postgres courants
(`23505`, `42501`, `PGRST116`) sont traduits en portugais. La signature infère
sur la réponse entière (`R extends AnyPostgrestResult`) et non sur `data` : une
signature `{ data: T | null }` fait effondrer `T` en `never` sur les `select`
imbriqués.

---

## 5. Ce qui n'a pas été construit, et pourquoi

Conformément à la section 24 du concept produit : pas de réseau social, pas de
commentaires, pas de paiement, pas de marketplace, pas de reconnaissance vocale.

Deux tables anticipent néanmoins la suite sans coûter de complexité aujourd'hui :

- `recipe_imports` — le pipeline « URL / texte / photo → recette structurée »,
  avec un statut `needs_review` obligatoire avant qu'un import devienne une
  recette. L'extraction n'est jamais crue sur parole.
- `adaptation_logs` — la traçabilité des adaptations assistées par IA. Le
  concept est explicite : elles doivent être validées, traçables, réversibles.
