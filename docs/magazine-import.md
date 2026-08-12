# Import de magazines PDF — back-office admin

Ce document explique comment un PDF de magazine de cuisine (Elle à Table,
Régal, Cuisine Actuelle, Saveurs, un magazine brésilien…) devient des recettes
Cookimix : structurées, adossées au même schéma que le reste du catalogue, et
jamais publiées sans qu'un humain les ait vues.

Le principe tient en une ligne, la même que pour `docs/recipe-importers.md` :
**une source, un format interne.** Une recette de magazine ne réinvente rien —
elle traverse le même normaliseur de quantités, d'unités, de durées et de
programmes Thermomix qu'une recette Cookomix ou Cookidoo.

---

## 0. Où c'est, qui y a accès

```
Mais → Administração → Importações → Magazine PDF → Novo import
```

Réservé aux `role = admin`. Trois niveaux, pas un :

1. **UI** — `useIsAdmin()` masque l'entrée dans `MoreScreen`, `RequireAdmin`
   redirige la route.
2. **Base** — les cinq tables de la migration 17 n'ont qu'une policy :
   `is_admin()`.
3. **Serveur** — `magazine-vision` relit `profiles.role` à chaque appel, pas
   seulement le JWT.

Masquer l'écran n'est jamais compté comme une protection : c'est le niveau 3
qui empêche un utilisateur connecté d'appeler l'Edge Function directement.

---

## 1. Le pipeline

```
PDF
  ↓ upload              storage bucket privé `imports` (déjà existant)
  ↓ probe               pdfjs-dist : nombre de pages, texte page 1, miniature
  ↓ ensurePagesRead      texte de chaque page → magazine_import_pages
  ↓ ensureIndexRead      sommaire lu du texte, ou par IA si trop mince (§8)
  ↓ classifyPages        texte d'abord (gratuit), IA seulement si ambigu
  ↓ extractRecipePages   une page à la fois → magazine_import_items (bruts)
  ↓ assembleIfReady       recolle multi-recettes/multi-pages, note, adapte
  ↓ review                l'admin corrige, approuve, ignore
  ↓ importItem            écrit dans `recipes` — un brouillon, jamais publié
```

Chaque flèche écrit son résultat en base avant la suivante. Relancer
`runMagazineImport()` sur le même import reprend exactement où les lignes
disent qu'il s'est arrêté — voir §7.

### Où vivent les fichiers

```
src/lib/pdf/
  document.ts        pdfjs-dist : page count, texte, rendu JPEG. Touche un vrai
                      <canvas> et un worker — pas testable sous jsdom.
  text.ts             les deux fonctions pures qu'on en a extraites, testées.

src/lib/magazine-import/
  types.ts            le vocabulaire : MagazinePage, MagazineRecipe,
                       AssembledRecipe, MagazineVisionProvider…
  schema.ts            Zod strict sur chaque réponse du modèle
  page-classifier.ts   classification par texte, gratuite
  folio.ts             page imprimée ↔ position dans le fichier
  index-reader.ts      lecture du sommaire (texte, puis IA si besoin)
  pipeline.ts           quelles pages méritent un appel au modèle — testé
  assemble.ts           multi-recettes/page, multi-pages/recette
  confidence.ts         score, plafonné par la structure, jamais par le modèle
  identity.ts            capa → publication/numéro/date/langue
  to-canonical.ts        MagazineRecipe → CanonicalRecipe (le raccord)
  labels.ts               libellés pt-BR partagés par les trois écrans
  item-confidence.ts       relit magazine_import_items.confidence (jsonb)
  providers/openai-edge.ts  la seule implémentation de MagazineVisionProvider

supabase/functions/magazine-vision/
  index.ts              admin vérifié, appel OpenAI, coût calculé
  prompts.ts             les trois prompts, versionnés, hors du code React

src/features/admin/
  hooks.ts               useIsAdmin()

src/features/magazine-import/
  api.ts                  repository — une policy RLS, admins only
  hooks.ts                câblage TanStack Query, imports lazy de pdfjs
  runner.ts                l'orchestrateur reprenable

src/app/screens/admin/
  ImportacoesScreen.tsx      liste des sources + historique
  NewMagazineImportScreen.tsx glisser-déposer, capa éditable
  MagazineImportScreen.tsx    progression + liste des receitas (§22 et §45,
                               un seul écran)
  MagazineItemScreen.tsx      comparaison source/Cookimix, édition (§23)
```

---

## 2. Le format interne : rien de nouveau

`MagazineRecipe` (`types.ts`) est volontairement pauvre : `quantity`, `unit`,
`ingredient`, `preparation`, `optional` par ligne ; `order`, `instruction` par
étape. Rien n'est traduit, rien n'est deviné — exactement la règle de
`docs/recipe-importers.md` §2.

`to-canonical.ts` fait tout le travail en une fonction : il présente cette
forme pauvre comme un `RawRecipe`, et `normalizeRecipe()` — déjà écrit, déjà
testé pour Cookomix et Cookidoo — s'occupe du reste. « Faites cuire à l'air
fryer à 190 °C pendant 12 minutes » ressort en `equipment: 'air_fryer'`,
`temperatureC: 190`, `durationSeconds: 720` sans une ligne de code écrite ici.

`source_provider = 'magazine'` fait tomber la recette sous la contrainte de
la migration 14 : **impossible à publier directement depuis la base.** Le
chemin vers une publication reste celui de la §5 bis de
`docs/recipe-importers.md` (extraction des faits → génération originale) —
rien n'est différent pour une recette de magazine.

---

## 3. §8 en pratique : lire le sommaire d'abord

`index-reader.ts` lit `readIndexFromText()` sur le texte de chaque page —
gratuit. Si ça donne au moins quatre entrées, c'est utilisé tel quel.

Sinon, `ensureIndexRead()` (dans `runner.ts`) tente un seul appel IA sur les
pages qui ressemblent à un sommaire (détecté par `classifyByText`, ou à
défaut les pages 2 à 6). Le résultat — même vide — est marqué `indexReady` dans
`magazine_imports.metadata` pour ne jamais retenter à chaque reprise.

`pipeline.ts::planClassification()` utilise ensuite cet index pour décider,
page par page :

- une page dont le texte est déjà clair (recette ou pas) → réglée gratuitement
- une page ambiguë **proche d'une entrée du sommaire** → un appel IA
- une page ambiguë **loin de tout, avec un sommaire jugé fiable** → ignorée,
  et le nombre de pages ignorées est écrit dans les logs — jamais silencieux
- une page ambiguë sans sommaire fiable → un appel IA quand même : dépenser un
  jeton coûte moins cher que rater une recette

Le folio (numéro imprimé) et la position dans le fichier divergent presque
toujours — couverture et publicités non numérotées en tête. `folio.ts` mesure
l'écart en comparant les folios lus sur autant de pages que possible, plutôt
que de le supposer.

---

## 4. Modèle de données

Cinq tables (migration `20260812200000_magazine_imports.sql`), RLS
`is_admin()` partout :

```
magazine_imports        le fichier, son identité, où en est le traitement
magazine_import_pages   une ligne par page — le mécanisme de reprise
magazine_import_items   une ligne par recette, source_data + transformed_data
magazine_import_logs    ce qui s'est passé, dans l'ordre
ai_usage_events          coût par appel — pas spécifique aux magazines
```

`magazine_import_items.confidence` est un jsonb volontairement sans forme
déclarée en base ; `item-confidence.ts` est le seul endroit qui lui en donne
une (`{overall, title, ingredients, steps, verdict, findings, indexedTitle}`),
et il ne fait jamais confiance à ce qu'il y trouve sans le vérifier.

Aucun nouveau bucket : `imports` (migration 10) est déjà privé, déjà limité à
20 Mo, déjà scopé `{uid}/`.

```
imports/{uid}/magazines/{importId}/original.pdf
imports/{uid}/magazines/{importId}/cover.jpg
```

---

## 5. Reprise après interruption (§31)

`magazine_import_pages` porte un statut par page (`pending` / `classified` /
`extracted` / `skipped` / `failed`). `runMagazineImport()` ne tient aucun état
en mémoire d'un appel à l'autre : à chaque invocation, il relit ce que la base
sait déjà et ne retraite que ce qui reste `pending` ou `failed`.

Fermer l'onglet en plein milieu, revenir le lendemain : `MagazineImportScreen`
relance automatiquement le pipeline au montage si le statut de l'import n'est
pas terminal, en re-téléchargeant le PDF depuis le stockage privé (le fichier
en mémoire du navigateur n'existe que juste après l'upload, transmis une fois
par l'état de la navigation React Router).

---

## 6. Coût IA (§33)

`ai_usage_events` — délibérément générique, pas `magazine_ai_costs` : les
passes `adapt-recipe` et `generate-recipe` devraient y écrire aussi un jour.
Le coût est calculé **à l'appel**, dans `magazine-vision/index.ts`, à partir
d'une table de prix qui doit être tenue à jour manuellement — un prix figé se
sous-estime avec le temps, il ne corrompt jamais ce qui a déjà été écrit.

---

## 7. Validation IA et retry (§36)

Chaque réponse du modèle passe par `schema.ts` (Zod strict) côté client. Une
réponse qui ne colle pas au schéma déclenche **un** nouvel appel
(`openai-edge.ts::callAndValidate`) ; si le second échoue aussi,
`InvalidVisionResponseError` remonte et la page ou l'extraction concernée est
marquée `failed` avec le message d'erreur, pour révision manuelle plutôt que
de bloquer tout l'import.

---

## 8. Ce qui est fait, et ce qui reste (§46)

**Fait (P0)** : navigation, permissions admin des deux côtés, upload PDF,
stockage, lecture des pages, sommaire, classification, extraction structurée,
liste des recettes avec filtres, écran de revue comparatif, édition manuelle
(titre, description, porções, temps total, ingrédients, étapes), validation,
création de la recette dans la base existante, historique, reprise, logs.

**Préparé, pas branché (P1)** — l'architecture n'a rien à changer pour les
ajouter :

- **Traduction / adaptation Brésil** — `adapt-recipe` existe déjà et prend
  n'importe quel brouillon importé, magazine compris ; il ne manque qu'un
  bouton sur `MagazineItemScreen`.
- **Adaptation Thermomix / Air Fryer, calcul nutritionnel, tags automatiques**
  — affichés en `Em breve` sur l'écran de revue plutôt que masqués, pour que
  l'admin voie le workflow prévu sans qu'un bouton ne fasse semblant de
  marcher.
- **Détection de doublons par similarité (§43)** — seule la détection exacte
  (`findDuplicate`, fingerprint/external_id/source_url, partagée avec tout le
  reste du pipeline d'import) tourne aujourd'hui. La comparaison floue
  titre/ingrédients en pourcentage n'est pas construite.

**Limite connue** : supprimer un import (§30) efface les lignes en base mais
ne parcourt pas le bucket de stockage pour libérer le PDF et les rendus de
page — un nettoyage par lot, pas un clic que l'admin doit attendre.

**Non couvert** : import Cookomix / Cookidoo en lot depuis le back-office
(cartes « Em breve » sur `ImportacoesScreen` — les importeurs eux-mêmes
existent déjà côté `/importar`, mais pas ce flux-là). Formats JPG/PNG/EPUB.
Génération de photo. Auto-approve au-delà d'un seuil de confiance.
