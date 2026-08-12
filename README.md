# Meu Petit Chef

PWA de receitas que se adaptam aos equipamentos, aos objetivos nutricionais e às porções de cada pessoa.

> Qualquer receita. Do seu jeito. Com os aparelhos que você tem.

---

## Estado actuel

L'infrastructure est en place et vérifiée de bout en bout. Le design (prototype
Claude Design **Meu Petit Chef**) n'est pas encore implémenté : les 18 écrans
existent, sont routés et branchés sur la base, mais 11 d'entre eux affichent
encore un gabarit décrivant ce qu'ils feront.

| Domaine                                                             | État                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Base de données Supabase (33 tables, 1 vue, 11 fonctions, 13 enums) | ✅ écrite et vérifiée                                                                                          |
| RLS sur 100 % des tables                                            | ✅                                                                                                             |
| Types TypeScript générés depuis les migrations                      | ✅ sans Docker                                                                                                 |
| Client Supabase typé + repositories par domaine                     | ✅                                                                                                             |
| Router, guards auth/onboarding, shell, tab bar                      | ✅                                                                                                             |
| PWA (manifest, service worker, offline, icônes)                     | ✅                                                                                                             |
| Design system Signal Noir (tokens → Tailwind v4)                    | ✅                                                                                                             |
| Écrans branchés sur données réelles                                 | Início, Buscar, Favoritos, Receita, Cozinhar, Perfil, Entrar                                                   |
| Écrans en gabarit                                                   | Sugestões, Despensa, Livro, Ficha, Semana, Preparo, Compras, Diário, Equipamentos, Mais, Importar, Boas-vindas |

---

## Démarrage

### 1. Installer

```bash
npm install
```

### 2. Créer le projet Supabase

Il n'existe pas encore. Sur [supabase.com](https://supabase.com/dashboard) :
créez un projet (région `South America (São Paulo)`), puis récupérez dans
**Project Settings → API** l'URL et la clé `anon`.

### 3. Configurer l'environnement

```bash
cp .env.example .env.local
```

Remplissez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. **Jamais** la clé
`service_role` : elle est secrète et n'a rien à faire dans un bundle navigateur.

### 4. Pousser le schéma

```bash
npx supabase login
npx supabase link --project-ref VOTRE_REF
npm run db:push:seed
```

`db:push:seed` applique les 11 migrations puis le seed (10 recettes, dont la
lasanha entièrement modélisée : 3 variantes × 3 parcours × étapes × cadrans).

### 5. Lancer

```bash
npm run dev
```

---

## Scripts

| Script                                       | Rôle                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                                | Serveur de développement Vite (port 5173)                                |
| `npm run build`                              | Typecheck + build de production + service worker                         |
| `npm run verify`                             | Chaîne complète : schéma, types, lint, tests, build                      |
| `npm run db:verify`                          | Applique migrations + seed dans un Postgres WASM et assère 21 invariants |
| `npm run db:types`                           | Régénère `src/lib/supabase/database.types.ts` depuis les migrations      |
| `npm run db:push` / `db:push:seed`           | Pousse le schéma vers le projet Supabase lié                             |
| `npm run db:diff -- nom`                     | Crée une migration à partir d'un changement fait dans Studio             |
| `npm run icons`                              | Régénère les icônes PWA depuis `brand/`                                  |
| `npm run recipe:urls -- --provider cookomix` | Génère `urls.txt` depuis le sitemap du site                              |
| `npm run recipe:import -- URL`               | Importe une recette (Cookomix, Cookidoo) — prévisualise, `--save` écrit  |
| `npm run recipe:import-batch`                | Importe une liste d'URLs, lentement et de façon reprenable               |
| `npm run recipe:adapt`                       | Réécrit les recettes importées en pt-BR, ingrédients brésiliens          |
| `npm run test` / `test:watch`                | Vitest                                                                   |
| `npm run lint` / `lint:fix`                  | ESLint                                                                   |

### Docker n'est pas nécessaire

`supabase start` et `supabase gen types` exigent Docker. Il n'est pas installé
ici, donc deux scripts le contournent en appliquant les migrations à
**PGlite** — un vrai Postgres 17 compilé en WebAssembly :

- `db:verify` rejoue tout le schéma et vérifie 21 invariants en ~1 seconde ;
- `db:types` introspecte le catalogue et écrit le fichier de types.

Conséquence pratique : **relancez `npm run db:types` après chaque migration**,
et `npm run db:verify` avant de pousser quoi que ce soit en cloud.

---

## Architecture

```
src/
├─ app/          router, routes, guards, providers, écrans
├─ components/   shell, header, primitives UI (Button, Card, states)
├─ config/       env validé par Zod, constantes de marque
├─ domain/       types métier, équipements, chefs, mise à l'échelle des portions
├─ features/     un dossier par domaine : api.ts (repository) + hooks.ts
│  ├─ auth/ profile/ recipes/ favorites/ cook/
│  └─ pantry/ planning/ shopping/ diary/
├─ hooks/        useWakeLock, useInstallPrompt, useOnlineStatus
├─ lib/          client Supabase, gestion d'erreurs, query client, formatage
└─ styles/       tokens du design system + pont Tailwind v4

supabase/
├─ migrations/   11 fichiers, appliqués dans l'ordre
└─ seed.sql      données de démarrage idempotentes

scripts/
├─ build-schema.mjs   monte un Postgres WASM avec les migrations
├─ verify-schema.mjs  assertions sur le schéma
├─ gen-types.mjs      génération des types
└─ gen-icons.mjs      icônes PWA
```

Détail des décisions : [docs/architecture.md](docs/architecture.md).

---

## Ce qui reste à faire

1. **Créer le projet Supabase** et pousser le schéma (étapes 2-4 ci-dessus).
2. **Récupérer les illustrations des chefs** depuis le projet Claude Design
   (`assets/chef-normal.png`, `chef-gourmand.png`, `chef-fit.png`) vers
   `public/chefs/` — `src/domain/chef-modes.ts` les référence déjà.
3. **Implémenter le design** écran par écran, en remplaçant les gabarits.
4. **Photographier / générer les visuels de recettes** et les téléverser dans le
   bucket `recipe-images`.
5. **Back-office `/admin`** pour créer et valider les recettes sans toucher au code.

---

## Déploiement — GitHub Pages

Le site est publié sur https://flambe02.github.io/MeuPetitChef/ par
`.github/workflows/deploy-pages.yml` à chaque push sur `main`. Les Pull
Requests sont vérifiées et construites, jamais publiées.

> ⚠️ **Le dépôt est privé, le site publié ne l'est pas.** Publier des Pages en
> accès restreint demande GitHub Enterprise. Tout ce que l'application affiche
> sans authentification est donc public.

### Deux secrets à renseigner

Settings → Secrets and variables → Actions :

| Secret                   | Valeur                      |
| ------------------------ | --------------------------- |
| `VITE_SUPABASE_URL`      | l'URL du projet Supabase    |
| `VITE_SUPABASE_ANON_KEY` | la clé `anon` / publishable |

La clé anon est publique par conception — elle part dans le bundle du
navigateur, et ce sont les politiques RLS qui protègent les données, pas le
secret de cette clé. Elle passe par les secrets du dépôt pour ne pas vivre
dans le code.

### Le sous-chemin

Pages sert un site de projet depuis `/<dépôt>/`, pas depuis la racine. Quatre
endroits en dépendent, tous dérivés d'une seule variable :

|                                                                |                                        |
| -------------------------------------------------------------- | -------------------------------------- |
| `base` Vite                                                    | `VITE_BASE_PATH`, posé par le workflow |
| manifeste PWA (`id`, `start_url`, `scope`, icônes, raccourcis) | `vite.config.ts`                       |
| `basename` du routeur                                          | `import.meta.env.BASE_URL`             |
| redirection du lien de connexion                               | `import.meta.env.BASE_URL`             |

Pour reproduire le build des Pages en local :

```bash
VITE_BASE_PATH=/MeuPetitChef/ npm run build:pages
```

Sous Git Bash (Windows), préfixez par `MSYS_NO_PATHCONV=1` — sinon le shell
transforme `/MeuPetitChef/` en chemin Windows avant que Vite le voie.

### Le repli SPA

Pages n'a pas de règle de réécriture : un lien partagé vers `/receita/xxx`
chercherait un dossier inexistant. `build:pages` copie donc `index.html` en
`404.html` — Pages le renvoie, l'application démarre et le routeur lit l'URL
demandée. Le code HTTP reste 404, ce qui est cosmétiquement faux et sans effet
visible.

### À faire côté Supabase

Authentication → URL Configuration → **Redirect URLs** doit contenir
`https://flambe02.github.io/MeuPetitChef/`, sinon le lien magique de connexion
est refusé.

---

## Documentation

- [Concept produit détaillé](docs/concept-produit.md)
- [Décisions d'architecture](docs/architecture.md)
- [Maquettes écran](docs/ecran-mockup.pdf)
- Prototype cliquable : projet Claude Design _Cookimix Brasil prototype cliquable_
