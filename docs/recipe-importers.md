# Import de recettes — Cookomix, Cookidoo et la suite

Ce document explique comment une recette publiée ailleurs devient une recette
_de chez nous_ : structurée, adossée au même schéma que le reste du catalogue,
et jamais dépendante du site d'origine.

Le principe tient en une ligne : **un adaptateur par source, un seul format
interne.** Ajouter TudoGostoso ou Marmiton doit coûter un fichier, pas un
deuxième scraper.

---

## 0. À quoi sert l'import — et à quoi il ne sert pas

**Une recette importée est une référence, pas du catalogue.**

Les CGU de Cookomix nomment explicitement « les recettes » et interdisent
« toute reproduction, représentation, modification, publication, **adaptation** »
sans autorisation écrite. Cooknet étant un éditeur français, le droit _sui
generis_ des bases de données s'ajoute : extraire une part substantielle d'une
base est sanctionnable indépendamment du droit d'auteur sur chaque recette. Les
sites brésiliens sont encore plus directs — TudoGostoso et Receiteria
interdisent `/receita/` dans leur `robots.txt`, et le fetcher les respecte.

La frontière juridique est celle-ci, et elle est nette : **l'idée n'est pas
protégée, l'expression l'est.**

|                                                                                                                        |                                          |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Lire « gratin dauphinois = pommes de terre + crème + ail, 20 min/100 °C puis four 25 min/210 °C » et écrire sa version | des faits — légitime                     |
| Prendre le texte et le traduire en pt-BR                                                                               | une _adaptation_ — interdite par les CGU |

D'où le chemin implémenté :

```
référence importée (privée, jamais publiée)
     ↓  extractFacts       plat, ingrédients, temps, températures — pas une phrase
     ↓  buildBrief         « écris cette recette pour ces appareils »
     ↓  generate-recipe    le chef écrit son propre pas à pas
     ↓  checkOriginality   refuse un décalque
recette originale, sans source_provider → publiable
```

La contrainte `imported_recipe_stays_reference` (migration 14) met la règle dans
la base plutôt que dans le code : un back-office, un script ou un `update` à la
main ne peuvent pas la contourner par distraction.

```sql
check (source_provider is null or status <> 'published')
```

Deux usages restent parfaitement sains :

1. **L'utilisateur importe _ses_ recettes** dans sa collection privée — copie
   personnelle, usage privé. C'est ce que fait l'écran `/importar`.
2. **S'inspirer** : lire comment un plat se prépare et avec quels paramètres,
   puis générer sa propre version pour ses appareils.

Ce qui n'est pas sain, et que ce projet a délibérément écarté : importer 2 412
recettes d'un site tiers pour en faire son catalogue. C'est aussi le plus
mauvais produit possible — qui, au Brésil, cherche « anchoïade camarguaise » ?

---

## 1. Le pipeline

```
SOURCE
  ↓  fetch          scripts/recipe-importers/runtime/fetcher.ts   (robots.txt, backoff)
  ↓  parse          src/lib/recipe-import/providers/<source>.ts   → RawRecipe
  ↓  normalize      src/lib/recipe-import/recipe-normalizer.ts    → CanonicalRecipe
  ↓  validate       src/lib/recipe-import/validate.ts             → erreurs + avertissements
  ↓  preview        CLI (par défaut) ou écran /importar
  ↓  save           src/lib/recipe-import/persist.ts              → Supabase (brouillon)
```

Le cœur (`src/lib/recipe-import/`) ne connaît **ni Node ni le navigateur** : il
reçoit un `Document` déjà construit. La CLI le fabrique avec jsdom, l'application
avec `DOMParser`. C'est ce qui permet aux deux interfaces de partager exactement
le même analyseur — pas deux implémentations qui divergent au bout de trois mois.

### Où vivent les fichiers

```
src/lib/recipe-import/
  types.ts                 RawRecipe, CanonicalRecipe, RecipeImporter, ValidationResult
  text.ts                  fractions, slugs, normalisation
  duration.ts              tout → secondes
  temperature.ts           tout → °C, sauf « Varoma » qui reste un mot
  units.ts                 g / kg / ml / l / tsp / tbsp / pitada + énergie
  thermomix.ts             le panneau de commande, en données
  ingredient-normalizer.ts lignes d'ingrédients → lignes canoniques
  step-normalizer.ts       instructions → étapes + appareil + cadrans
  recipe-normalizer.ts     assemblage
  validate.ts              erreurs (bloquantes) et avertissements (non bloquants)
  fingerprint.ts           SHA-256 maison, pour la déduplication
  jsonld.ts                lecture schema.org
  registry.ts              catalogue des providers + `runImport`
  persist.ts               écriture Supabase
  providers/cookomix.ts
  providers/cookidoo.ts
  providers/social.ts      Instagram / Facebook — lit la légende structurée

supabase/functions/
  import-recipe/index.ts   récupère l'URL côté serveur, lit la légende par IA

scripts/recipe-importers/
  import-recipe.ts         une recette
  import-batch.ts          une liste
  runtime/fetcher.ts       HTTP poli : robots.txt, User-Agent, backoff, 429
  runtime/dom.ts           jsdom
  runtime/env.ts           lecture de .env.local sans dépendance
  runtime/supabase.ts      client service_role
  runtime/pipeline.ts      un import de bout en bout
  runtime/log.ts           [IMPORT] [FETCH] [PARSE] [NORMALIZE] [ERROR]
  runtime/report.ts        le résumé lisible

tests/fixtures/            extraits techniques enregistrés (jamais de réseau en test)
```

---

## 2. Le format interne

Il n'y en a qu'un, et **ce n'est pas une nouvelle représentation** : il calque
le schéma qui existe déjà.

```
CanonicalRecipe
├── ingredients[]        → recipe_ingredients (+ recipe_ingredient_groups)
├── paths[]              → cooking_paths          ← une seule route à l'import
│   └── steps[]          → cooking_steps
│       └── thermomix    → cooking_step_dials     (tempo/temperatura/velocidade/modo)
├── nutrition            → recipe_variants (mode `normal`)
├── notes[]              → recipe_notes
└── source               → recipes.source_provider / source_url / source_image_url
```

Un import produit **une seule route**, celle que la source publie. Le support
multi-appareils n'est pas un champ `variants` sur l'étape : c'est une deuxième
ligne `cooking_paths`, ce que l'application sait déjà faire. Un modèle
concurrent aurait été un doublon.

### Thermomix

```ts
thermomix: {
  durationSeconds: number | null;
  temperatureC: number | 'varoma' | null;
  speed: number | 'spoon' | 'knead' | 'turbo' | null;
  speedText: string | null; // « vitesse mijotage » tel qu'écrit
  reverse: boolean;
  turbo: boolean;
  varomaAccessory: boolean; // le plateau, pas la température
}
```

`Varoma` reste un mot parce que la machine affiche un mot. Le convertir en
120 °C rendrait indistinguables « Cuire 15 min/Varoma » (cuisson vapeur dans le
plateau) et « Cuire 15 min/120 °C » (chauffe du bol). Idem pour la vitesse
cuillère.

Formes réellement rencontrées et gérées :

```
Cuire 20 min/100°C/Vitesse Cuillère.
Rissoler 3 min 30 sec/120°C/vitesse 1.
Mélanger 2 min/vitesse pétrin.
Cuire 15 min/Varoma/Vitesse Cuillère.
Cuire 10 min/100°C/sens inverse/vitesse mijotage
5 Min./100°C/Stufe 1          20 min/100°C/speed 1          5 seg/vel. 5
Cozinhe 15 min/Varoma/sentido inverso/vel. colher
```

Un piège mérite d'être signalé, parce qu'il a coûté un bug : en français, la
cuillère **doseuse** et la vitesse **cuillère** s'écrivent pareil. « Ajouter ½
cuillère à café de sel » n'est pas une programmation. Une vitesse nommée n'est
donc reconnue que si le segment porte aussi le mot « vitesse » (ou son
équivalent local), ou s'il ne contient que le nom de la vitesse.

### Ingrédients : rien n'est traduit

```json
{
  "sourceName": "crème fraîche épaisse",
  "sourceQuantity": "500",
  "sourceUnit": "grammes",
  "normalizedName": null,
  "quantity": 500,
  "unit": "g",
  "unitKind": "mass"
}
```

`normalizedName` reste `null` à l'import, **toujours**. Une traduction
mécanique vers « creme de leite » est une décision produit déguisée en
conversion : elle change la recette, et on ne peut plus revenir en arrière. La
version brésilienne viendra d'une passe d'adaptation explicite, plus tard.

Même logique pour les unités : `sourceUnit` est conservé, et une unité inconnue
(« gousse », « Würfel », « Stück ») traverse telle quelle avec
`unitKind = 'count'` plutôt que d'être perdue. La validation lève alors un
avertissement, pas une erreur.

---

## 3. Les providers

### Cookomix

`robots.txt` autorise les pages de recettes. Le site publie un bloc
`schema.org/Recipe` complet, avec — c'est ce qui fait la valeur — chaque étape
typée par un `HowToStep` dont le `name` dit de quelle _sorte_ d'étape il s'agit :

```
Ajout d'ingrédient · Ajout d'accessoire · Ajout du couvercle ·
Programmation du Thermomix · Préchauffage du four · Mise au four ·
Transfert de la préparation · Mise de côté · Précisions · Dégustation !
```

C'est une classification que le site a déjà faite ; l'importeur s'en sert pour
attribuer l'appareil au lieu de deviner à partir de la prose.

Le DOM complète ensuite, sans jamais remplacer :

| Donnée               | Source                                         |
| -------------------- | ---------------------------------------------- |
| identifiant externe  | `window.recipeId = 205`                        |
| macros complètes     | `dl.basic.prez` (le JSON-LD ne donne que kcal) |
| durée totale         | `dl.basic.prez` → « Durée totale »             |
| ingrédients découpés | `dl.ingredients` (`<dt>` quantité, `<dd>` nom) |
| étiquettes           | `.recipe-themes a.recipe-theme`                |
| compatibilité        | `dl.basic.user` → « Recette pour TM31, TM5… »  |

Détail qui compte : Cookomix met la durée **totale** dans `cookTime`. Additionner
`prepTime + cookTime` surestimerait chaque recette de son temps de préparation.

### Cookidoo

Vérifié sur les pages publiques :

- la page **sert** un JSON-LD `Recipe` avec le titre, les temps, le rendement,
  les ingrédients et la nutrition, repris dans le DOM (`<recipe-ingredient>`,
  `<rdp-difficulty>`, `<rdp-nutritious>`) ;
- la page **ne sert pas** `recipeInstructions`. Les étapes font partie de
  l'abonnement et ne sont pas dans le HTML — même pas cachées.

**C'est la limitation connue, et elle n'est pas contournée.** Pas de CAPTCHA
forcé, pas de jeton fabriqué, pas d'endpoint privé, pas de rejeu de session. Un
import depuis une URL publique produit donc une recette sans étapes, qui échoue
la validation avec `no_steps` et le dit.

Trois modes, dont deux qui fonctionnent pleinement :

| Mode | Entrée                       | Étapes ? | Commande                                           |
| ---- | ---------------------------- | -------- | -------------------------------------------------- |
| 1    | URL publique                 | non      | `npm run recipe:import -- "https://cookidoo.fr/…"` |
| 2    | HTML enregistré par l'abonné | oui      | `--provider cookidoo --file recette.html`          |
| 3    | JSON (schema.org) fourni     | oui      | `--provider cookidoo --file recette.json`          |

Le mode 2 est simplement « Ctrl+S » ou « Ctrl+U puis copier » depuis _votre_
navigateur, sur une page à laquelle _vous_ avez légitimement accès. Rien n'est
détourné : le fichier est lu, pas récupéré.

Les sélecteurs d'étapes du mode 2 sont **heuristiques** et documentés comme
tels : n'ayant pas pu observer une page abonnée, l'importeur essaie plusieurs
conteneurs (`#preparation-section recipe-step`, `recipe-step`,
`[data-test-id="recipe-step"]`, puis une liste ordonnée sous un titre
« Préparation » dans les langues du site) et ne trouve rien plutôt que
d'inventer.

### Instagram et Facebook

Un post ne publie pas de recette. Il publie une **légende** : de la prose, avec
parfois les quantités, parfois seulement dans la vidéo. Aucun sélecteur ne lit
ça, et prétendre le contraire produirait des recettes fausses avec assurance.

La légende est donc lue par le modèle, dans `import-recipe`, et rendue sous
forme d'objet `schema.org/Recipe` — c'est-à-dire dans le format que le reste du
pipeline sait déjà analyser. Le provider `social` n'a rien d'autre à faire que
lire cet objet, exactement comme `cookidoo` lit un JSON exporté.

Conséquence voulue : **rien n'est traité à part.** Le même normaliseur déduit
l'appareil (« na air fryer a 180 °C por 15 minutos » → `air_fryer`, 180 °C,
900 s), le même validateur refuse une recette sans ingrédient, la même empreinte
détecte un doublon. Ce qui sort du modèle est **validé, pas cru sur parole**.

L'invite d'extraction interdit d'inventer, et le dit deux fois : une quantité
absente de la légende reste absente, un temps non écrit n'est pas déduit, et si
le texte ne donne pas le mode de préparo, `steps` revient vide plutôt que
reconstitué à partir des ingrédients. Elle interdit aussi de traduire — un
import garde la langue de sa source jusqu'à la passe d'adaptation explicite
(§5 ter), comme pour Cookomix.

Les deux réseaux tiennent dans un seul provider parce que l'analyse est
identique ; le réseau survit dans l'identifiant externe (`instagram:C8xY_1aB2`),
où il est une donnée et non une deuxième branche de code.

**Limite honnête** : Instagram et Facebook servent leurs balises `og:` à un
appelant identifié comme le nôtre — vérifié —, mais un post privé, supprimé ou
protégé par un mur de connexion ne rend aucune légende. Le projet ne se déguise
pas en navigateur pour passer (§7) : dans ce cas la fonction répond « ce post
peut être privé, copiez la légende et collez-la », et le chemin collé fait le
même travail.

### Mode 4 — extension navigateur (préparé, pas construit)

`runImport()` accepte déjà `{ url, html, structuredData }`. Une extension ou un
bookmarklet n'aurait qu'à poster cet objet ; aucun code d'import ne changerait.

---

## 3 bis. L'Edge Function `import-recipe`

Ce que le navigateur ne peut pas faire, un serveur le peut. La fonction est le
seul endroit qui sort sur le réseau pour le compte de l'application.

```
POST /functions/v1/import-recipe   { url }  ou  { text }

  ↓ JWT vérifié auprès de Supabase Auth      un appelant anonyme ne dépense rien
  ↓ hôte comparé à la liste blanche          cookomix / cookidoo / instagram / facebook
  ↓ fetch, redirections suivies à la main    chaque saut est revérifié
  ↓
site de recettes  → { kind: 'html',       html }        analysé par le navigateur
post social       → { kind: 'structured', recipe }      légende lue par le modèle
```

**La liste blanche est une frontière de sécurité, pas un confort.** Le
navigateur en a sa propre copie pour décider quel bouton activer, mais celle-là
est de l'ergonomie et se contourne en trois secondes. Un serveur qui télécharge
ce qu'on lui demande est un proxy ouvert vers tout ce qu'il peut joindre, à
commencer par les points d'accès internes de la plateforme. D'où : domaines
enregistrables listés, `https` seulement, et **la même vérification rejouée à
chaque redirection** — ne contrôler que le premier saut revient à ne rien
contrôler. Facebook redirige déjà en pratique (`/cookidoo/` → `/Cookidoo/`).

Autres garde-fous : 15 s de délai maximum, 3 Mo de corps maximum lu par morceaux
entiers, 5 redirections, 12 000 caractères envoyés au modèle au plus.

Un site de recettes ne coûte **aucun jeton** : ces pages publient leur
`schema.org/Recipe`, et l'analyseur déterministe qui lit « 20 min/100 °C/vitesse
1 » exactement vaut mieux qu'un modèle qui le lit à peu près.

### Déploiement

```bash
supabase secrets set OPENAI_API_KEY=sk-...     # déjà posé pour generate-recipe
supabase functions deploy import-recipe
```

Sans la clé, la fonction sert quand même les sites de recettes et répond 503 sur
la lecture d'une légende — la moitié qui n'a pas besoin d'IA continue de marcher.

---

## 4. Utilisation

### Une recette

```bash
npm run recipe:import -- "https://www.cookomix.com/recettes/gratin-dauphinois-thermomix/"
```

```
[IMPORT]   provider=auto url=https://www.cookomix.com/recettes/…
[FETCH]    OK=true status=200 bytes=135088
[PARSE]    ingredients=6 steps=12 thermomix_steps=9 parameters=1
[NORMALIZE]warnings=0 errors=0

✓ Provider detected: cookomix
✓ Recipe detected
✓ 6 ingredients
✓ 12 steps
✓ Thermomix parameters detected: 1/1 steps
✓ Equipment: thermomix, oven
✓ Recipe normalized

Recipe:
  Gratin Dauphinois au thermomix
  6 porções · 55 min · facil

Status:
  READY FOR REVIEW
```

Le ratio « parameters detected » compte les étapes **programmées**, pas toutes
les étapes Thermomix : sur douze étapes, onze sont des ajouts dans le bol et
n'ont aucun cadran à trouver.

Options utiles :

```bash
--save              écrit dans Supabase (sinon : prévisualisation seule)
--force             écrit malgré un doublon détecté
--json --out f.json sort la recette canonique
--raw               ajoute le payload brut de la source au JSON
--servings 4        force le nombre de portions
--provider cookidoo obligatoire avec --file
```

Codes de sortie : `0` valide, `2` validation échouée (il faut un humain), `1`
erreur technique.

### Un fichier

```bash
npm run recipe:import -- --provider cookidoo --file ./recette.html
npm run recipe:import -- --provider cookidoo --file ./recette.json
```

Le format interne produit est **exactement le même** que par URL.

### Un lot

D'abord la liste, depuis le sitemap du site — pas en parcourant ses pages :

```bash
npm run recipe:urls -- --provider cookomix --out urls.txt
# → 2412 URLs, en 4 requêtes
```

Puis l'import, en commençant petit :

```bash
npm run recipe:import-batch -- --input urls.txt --limit 10 --save
npm run recipe:import-batch -- --input urls.txt --save --delay 4000
```

Par défaut : **une requête à la fois, 3 secondes entre deux**. La concurrence
est plafonnée à 3, et l'écart demandé est appliqué après chaque page. Chaque URL
traitée est écrite dans un journal `.recipe-imports/<liste>.jsonl` ; relancer la
même commande reprend là où on s'était arrêté (les erreurs transitoires sont
retentées, les décisions ne le sont pas). `--restart` ignore le journal.

### L'écran /importar

**Une URL suffit.** Le navigateur ne peut toujours pas télécharger une page d'un
autre domaine — ni Cookomix, ni Cookidoo, ni Instagram n'envoient d'en-têtes
CORS, `fetch()` est refusé avant de partir — mais il n'a plus à le faire :
l'Edge Function `import-recipe` va chercher la page côté serveur (§3 bis).
L'écran affiche ensuite la prévisualisation habituelle — titre, ingrédients,
étapes, paramètres Thermomix détectés, avertissements — et n'écrit qu'après un
clic explicite.

Le champ « coller le texte » reste, ramené à ce qu'il a toujours été : la porte
d'entrée quand le téléchargement ne peut pas marcher. Une page Cookidoo que seul
son abonné ouvre, un post Instagram derrière un mur de connexion : on copie ce
qu'on voit, on le colle. Du HTML ou du JSON passe par les analyseurs ; de la
prose passe par la même lecture IA qu'une légende récupérée.

---

## 5. Ce qui est écrit en base

Rien n'est publié. Un import devient :

- une ligne `recipe_imports` : `provider`, `external_id`, `raw_data` (payload
  brut), `extracted` (recette normalisée), `fingerprint`, `warnings`, `status` ;
- si la validation passe, une recette **`status = 'draft'`** avec ses
  ingrédients, sa route, ses étapes, ses cadrans, sa variante nutritionnelle et
  une note d'attribution.

Le brouillon est privé par construction : la politique RLS `recipes: read
published` n'admet une ligne que si elle est publiée, écrite par l'appelant, ou
si l'appelant est éditeur.

Garder `raw_data` **et** `extracted` est délibéré : quand l'analyseur s'améliore,
on rejoue les imports existants sans retourner sur le site.

### Statuts

L'énumération `import_status` existante suffit, sans nouvelle valeur :

| Vocabulaire du besoin | En base                                   |
| --------------------- | ----------------------------------------- |
| fetched, parsed       | états transitoires, jamais stockés        |
| normalized            | idem                                      |
| needs_review          | `needs_review`                            |
| approved              | `accepted` (+ `recipe_id`, `reviewed_at`) |
| rejected, error       | `failed` + `error_message`                |

### Déduplication

Trois filets, du plus certain au plus large :

1. `(provider, external_id)` — **contrainte unique en base**, deux index
   partiels (un par utilisateur, un pour les imports machine) ;
2. `fingerprint` = `sha256(provider + titre replié + noms d'ingrédients triés)`,
   qui rattrape la même recette publiée sous deux URLs ;
3. `recipes.source_url`.

Le _slug_ est suffixé par les six premiers caractères de l'empreinte : déterministe
(réimporter la même page ne crée pas un nouveau slug) et unique globalement, ce
qu'exige `recipes.slug`.

### Imports machine

La CLI tourne avec la `service_role` et écrit des lignes dont `user_id` est
`null` (migration 13) : un import de catalogue n'appartient à personne. Ces
lignes sont invisibles pour tout utilisateur — `null = auth.uid()` vaut `null` —
et visibles pour les éditeurs, qui ont leur propre politique.

---

## 5 bis. De la référence à _votre_ recette

C'est le chemin qui produit du contenu publiable, et le seul.

```ts
extractFacts(reference, steps)   // plat, ingrédients, séquence de paramètres
buildBrief(facts, equipment)     // un prompt, sans une phrase de la source
generate-recipe                  // le chef écrit son propre pas à pas
checkOriginality(before, after)  // refuse un décalque
saveGeneratedDraft(...)          // sans source_provider → publiable
```

`extractFacts` est volontairement destructif : le texte des étapes, la
description et les tournures de l'auteur sont abandonnés là et ne vont pas plus
loin. Ce qui survit — les ingrédients et une suite de réglages d'appareil — ce
sont des faits. Un test l'assure explicitement : aucune phrase de la source ne
doit apparaître dans les faits extraits.

`checkOriginality` mesure deux choses, et dit honnêtement ce qu'elle voit :

- **le recouvrement littéral** (trigrammes de mots partagés) — au-delà de 20 %,
  c'est une copie et l'écriture est refusée. Cette mesure attrape la copie dans
  la même langue ; elle ne voit rien d'une traduction, puisqu'aucun trigramme ne
  survit au changement de langue. C'est une limite de la mesure, pas un
  certificat.
- **la suite de paramètres identique** — mêmes réglages, même ordre, même
  nombre d'étapes. La physique en impose une partie (les pommes de terre
  cuisent à 100 °C), donc c'est un avertissement, jamais une erreur. Sauf quand
  l'appareil a changé et que les nombres n'ont pas bougé : un air fryer réglé
  20 min à 100 °C parce que le Thermomix l'était n'est pas une conversion,
  c'est une copie qui ne cuira pas.

Dans l'app : bouton **« Cozinhar agora »** sur `/importar`, juste après la
lecture — avant tout enregistrement. Les faits sont pris sur la recette
canonique en mémoire plutôt qu'en base, ce qui est délibéré : une légende sans
nombre de portions ni durée ne passe pas la validation, ne devient donc jamais
une ligne, et c'est précisément le cas pour lequel ce bouton existe. Ce que la
source n'a pas donné, le chef l'écrit. Les appareils viennent du profil.

---

## 5 ter. L'adaptation brésilienne (usage privé)

> ⚠️ Cette passe réécrit le texte de la source. C'est exactement ce que les CGU
> de Cookomix appellent une « adaptation ». Elle reste donc réservée à une
> **référence privée** — la contrainte de la migration 14 empêche de toute façon
> de publier ce qu'elle produit. Pour du contenu publiable, voir §5 bis.

L'import est fidèle : une recette Cookomix arrive en français, avec de la crème
fraîche épaisse. L'adaptation la rend lisible pour vous, dans votre collection.

```
brouillon importé (fr)
   ↓  Edge Function adapt-recipe   (OpenAI, JSON schema strict)
réécriture pt-BR + ingrédients brésiliens
   ↓  verifyAdaptation             ← refuse si un chiffre a bougé
écriture en base + adaptation_logs
   ↓
recherche : « frango » trouve enfin la recette
```

### Ce que le modèle a le droit de changer

Titre, sous-titre, description, **noms** d'ingrédients, notes, **verbes** et
**texte** des étapes.

### Ce qu'il n'a pas le droit de changer

Durées, températures, vitesses Thermomix, quantités, unités, ordre et nombre
d'étapes.

Deux protections, pas une :

1. **Il ne les voit pas.** Les quantités, unités, durées et cadrans vivent dans
   leurs propres colonnes et ne sont jamais envoyés. Seule la prose part.
2. **On vérifie au retour.** `verifyAdaptation` relit durée, température et
   vitesse dans les phrases réécrites, avec les mêmes analyseurs que l'import :

   ```
   « Cuire 20 min/100°C/Vitesse Cuillère. »   → { 1200 s, 100 °C, colher }
   « Cozinhe 20 min/100°C/vel. colher. »      → { 1200 s, 100 °C, colher }  ✓
   « Cozinhe 5 min/100°C/vel. colher. »       → { 300 s,  100 °C, colher }  ✗ refusé
   ```

   Comparer deux traductions est impossible ; comparer les chiffres derrière ne
   l'est pas. Si un seul a bougé, **rien n'est écrit**. Une recette qui se lit
   parfaitement et cuit quatre fois trop peu est pire que pas de recette.

Les substitutions de produits remontent en **avertissements**, pas en erreurs :
c'est le but de la passe, mais un humain doit voir lesquelles avant publication.

### Traçable et réversible

Chaque adaptation écrit une ligne `adaptation_logs` (`kind = 'rewrite'`) avec
l'avant, l'après, le modèle utilisé et les avertissements. Le français original
reste par ailleurs dans `recipe_imports.raw_data` et `.extracted`. On peut donc
revenir en arrière depuis la base seule.

### Utilisation

```bash
npm run recipe:adapt -- --limit 5      # essai, 5 recettes
npm run recipe:adapt -- --dry-run      # juste la liste
npm run recipe:adapt -- --all          # tout le catalogue
npm run recipe:adapt -- --recipe <uuid>
```

Le script prend les brouillons importés qui n'ont pas encore de ligne `rewrite`
dans `adaptation_logs` : le relancer est sans danger, ce qui est fait est sauté.

Dans l'app, le bouton **« Adaptar para o Brasil »** apparaît sur l'écran
`/importar` juste après l'enregistrement.

### La reprise

Un refus n'est pas forcément une conviction du modèle. Sur un premier passage
réel, il a supprimé la ligne « Eau » d'un risotto, puis l'a rendue correctement
à la question suivante. `adaptWithRetry` redemande donc jusqu'à trois fois, et
n'écrit que si une réponse passe la vérification. La barre ne descend jamais :
au bout de trois essais, la recette est laissée telle quelle et signalée.

### Trois pièges rencontrés en vrai, et corrigés

**« null » arrive parfois comme une chaîne de quatre caractères.** Un schéma qui
déclare `["string", "null"]` n'empêche pas le modèle de répondre `"null"`. Au
premier passage réel, la note `null` a été écrite sur les six ingrédients.
`sanitizeAdaptation` normalise maintenant `"null"`, `"none"`, `"N/A"` et les
chaînes vides en vrai `null`, **avant** la vérification — sinon chaque
ingrédient remontait aussi comme une fausse substitution.

**`supabase.functions.invoke` ne convient pas pour l'appel machine.** Le client
Supabase ajoute un en-tête `apikey`, et la passerelle réécrit alors
`Authorization` : la fonction voit une identité que l'appelant n'a jamais
envoyée et répond 401. Le CLI fait donc un `fetch` direct, qui envoie
exactement ce qu'on veut envoyer.

### Déploiement

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy adapt-recipe --no-verify-jwt
```

La fonction accepte deux appelants :

- **l'app**, avec le jeton d'un utilisateur connecté, vérifié auprès de Supabase
  Auth — exactement comme `generate-recipe` ;
- **le lot**, avec un secret partagé dans l'en-tête `x-import-token`
  (`supabase secrets set RECIPE_ADAPT_TOKEN=…`, la même valeur dans
  `.env.local`).

Le chemin machine ne compare volontairement **pas** la clé de l'appelant à
`SUPABASE_SERVICE_ROLE_KEY` : les projets au nouveau format de clés portent des
valeurs `sb_secret_…` et non des JWT, ce que le runtime injecte sous ce nom
varie, et la passerelle peut réécrire `Authorization`. Un secret qu'on pose
soi-même, dans un en-tête que rien ne touche, est fiable ; une égalité sur tout
le reste est un pari.

La clé OpenAI ne quitte jamais le serveur.

---

## 6. Images

**Aucune image n'est téléchargée.** Seule l'URL d'origine est conservée
(`recipes.source_image_url`), pour l'écran de revue. Les recettes publiées
utiliseront nos propres photos, dans notre bucket, via `hero_image_path`.

L'application ne dépend donc jamais publiquement des images d'un tiers.

---

## 7. Politesse et règles d'accès

- `robots.txt` est lu **avant** la première requête vers un hôte, mis en cache,
  et respecté ; un chemin interdit lève `FetchRefused` et le lot le note
  « SKIPPED » plutôt que « ERROR ».
- User-Agent identifiable, avec une adresse de contact
  (`RECIPE_IMPORT_USER_AGENT` pour le personnaliser).
- Une requête à la fois par défaut, délai configurable.
- `429` et `5xx` : backoff exponentiel (2 s, 4 s, 8 s…, plafonné à 30 s) avec
  respect de `Retry-After`. Un `404` ou un `403` est une réponse, pas un
  incident : aucune réessai.
- Rien ne cherche à ressembler à un navigateur, à changer d'identité, ni à
  contourner une protection.

Importer une seule URL ne nécessite jamais de parcourir le site.

---

## 8. Variables d'environnement

Toutes dans `.env.local`, qui est ignoré par git. **Aucune clé secrète ne doit
porter le préfixe `VITE_`** : Vite n'expose au navigateur que celles-là.

| Variable                    | Nécessaire pour | Rôle                                     |
| --------------------------- | --------------- | ---------------------------------------- |
| `VITE_SUPABASE_URL`         | tout            | le projet (déjà présent)                 |
| `SUPABASE_SERVICE_ROLE_KEY` | `--save`        | écrire côté serveur, hors RLS            |
| `SUPABASE_URL`              | optionnel       | surcharge l'URL côté script              |
| `RECIPE_IMPORT_USER_ID`     | optionnel       | attribue les imports machine à un profil |
| `RECIPE_IMPORT_USER_AGENT`  | optionnel       | personnalise le User-Agent               |

---

## 9. Tests

```bash
npm test                       # tout
npx vitest run src/lib/recipe-import
```

Aucun test ne touche le réseau. Les fixtures de `tests/fixtures/` sont des
extraits techniques réduits des pages réelles — JSON-LD et blocs lus par
l'importeur, sans publicité ni navigation — sauf
`cookidoo/saved-recipe.html`, qui est **synthétique** et signalé comme tel dans
son en-tête (les étapes Cookidoo n'ont pas pu être observées).

Couvert : durées, températures, unités et énergie, ingrédients, paramètres
Thermomix (dont les pièges cuillère/Varoma), détection de provider, empreinte et
déduplication, les trois modes Cookidoo, et la forme des lignes écrites en base
(contraintes `total_minutes > 0`, `active_minutes <= total_minutes`,
`timer_enabled ⇒ duration`, un cadran par `(step, kind)`).

---

## 10. Ajouter un provider

1. Créer `src/lib/recipe-import/providers/<nom>.ts` qui exporte un
   `RecipeImporter` : `canHandle`, `externalIdFromUrl`, `parse`, `normalize`.
2. Dans `parse`, commencer par `findRecipeNode(extractJsonLd(document))` — la
   plupart des sites de recettes en publient un — puis compléter par le DOM.
   `normalize` délègue à `normalizeRecipe` et ne corrige que les particularités
   du site.
3. L'ajouter à `IMPORTERS` dans `registry.ts`.
4. Enregistrer une fixture réduite dans `tests/fixtures/<nom>/` et écrire le
   test qui va avec.

Ni la CLI, ni le lot, ni l'écran, ni la persistance ne changent.

---

## 11. Limitations connues

- **Cookidoo, étapes** : indisponibles sur les pages publiques (abonnement).
  Modes 2 et 3 pour les obtenir ; les sélecteurs du mode 2 sont heuristiques.
- **Instagram / Facebook** : un post privé, supprimé ou derrière un mur de
  connexion ne rend aucune légende, et rien ici ne cherche à passer outre. La
  fonction le dit et propose de coller la légende.
- **Légende lue par un modèle** : une recette de post est aussi complète que ce
  que l'auteur a écrit. Si les quantités ne sont que dans la vidéo, elles
  manqueront — signalées en avertissements, jamais devinées.
- **Traduction** : aucune. C'est un choix, pas un manque — voir §2.
- **Une seule route par import** : la route de la source. Les variantes Air
  Fryer / four / plaques viendront de la passe d'adaptation.
- **Groupes d'ingrédients** : aucune des deux sources n'en publie ; le champ
  existe et est écrit dès qu'une source en fournira.
- **Fahrenheit et unités impériales** : la température est convertie, les cups
  sont traitées comme des xícaras (approximation assumée, signalée par
  `sourceUnit`).
- `import_status` n'a pas de valeur `rejected` — voir la table du §5.
