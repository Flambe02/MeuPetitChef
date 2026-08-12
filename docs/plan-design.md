# Plan d'implémentation du design

Source de vérité : `example/proto/Meu Petit Chef.dc.html` (151 ko, 18 écrans).
Design system : `example/proto/_ds/signal-noir-…/`, dont la couche tokens et les
6 classes réellement utilisées sont déjà mirrorées dans `src/styles/`.

Ce document dit **quoi construire, dans quel ordre, et pourquoi cet ordre**. Il
ne réécrit pas le prototype : pour chaque écran, la référence reste le bloc
`<sc-if value="{{ isX }}">` correspondant dans le fichier ci-dessus.

---

## Deux règles qui traversent tout le plan

**1. Seize écrans sont en portrait, deux en paysage.** Le prototype le déclare
lui-même :

```js
isPortrait: st.screen !== 'cook' && st.screen !== 'spread';
```

Le mode cuisine et la ficha remplissent l'écran en largeur. Ils sortent donc de
`<AppShell>` (déjà le cas pour `cook`) _et_ de la contrainte `max-w-app` de
440 px, qui les réduit aujourd'hui à une colonne centrée avec deux bandes vides.

**2. L'appareil colore l'écran.** Les captures de cuisson montrent des étapes
Thermomix en graphite et des étapes Forno en bleu `#1B6BE0` — cadrans, contours
et tirets de progression compris. Les tokens `--color-eq-*` existent déjà dans
`src/styles/index.css` et ne sont utilisés nulle part.

---

## Phase 0 — Débloquer (≈ 5 min, aucune ligne de code)

| #   | Tâche                                                                                                                                  | État          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 0.1 | `orientation: 'any'` dans le manifeste PWA — `portrait` verrouillait l'app installée et rendait les deux écrans paysage inatteignables | ✅ fait       |
| 0.2 | Coller `supabase/migrations/20260809101100_suggestions.sql` dans le SQL Editor                                                         | ⬜ **à vous** |

Sans 0.2, l'accueil continue de proposer des recettes au four à quelqu'un qui
n'a pas de four.

---

## Phase 1 — Socle transverse

Rien de visible pour l'utilisateur, mais tout le reste en dépend. À faire avant
la phase 2, sous peine de réécrire trois fois les mêmes cadrans.

| #   | Tâche                                                                                                                          | Sert à               |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 1.1 | `equipmentAccent(equipment)` → renvoie le token `--color-eq-*`. Étendre `EQUIPMENT_THEME` plutôt que créer une table parallèle | cook, recipe, spread |
| 1.2 | `<LandscapeScreen>` : coquille plein écran, hors `AppShell`, sans `max-w-app`                                                  | cook, spread         |
| 1.3 | `<Dial>` : cercle (Thermomix) ou carré contourné (Forno), icône + label mono + valeur display + sous-label                     | cook                 |
| 1.4 | `<StepProgress>` : les tirets du bas, teintés par l'appareil de chaque étape                                                   | cook                 |
| 1.5 | Illustrations d'appareil en SVG inline (bol Thermomix, four)                                                                   | cook                 |

---

## Phase 2 — La séquence de cuisson

Le cœur du produit, et six de vos neuf captures. C'est ici que le travail a le
plus de valeur : c'est le seul écran qu'on utilise les mains sales, debout.

| #   | Tâche                                                                                                                                                                                                                                         | Notes                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Écran **« Antes de começar »** (portrait) : équipements requis avec leur nombre d'étapes et un bouton « Remover », les non utilisés grisés « não usado neste caminho », nutrition par portion / total, CTA « Começar » + « N etapas guiadas » | Nouvelle route. Le repository existe déjà (`cooking_paths`, `recipe_variants`)                                                                                                            |
| 2.2 | **Mode cuisine paysage** : barre supérieure (badge, titre, tag d'appareil, `01 / 18`, précédent/suivant, pause, son, micro, fermer), verbe + instruction à gauche, illustration à droite, cadrans, tirets, « Avançar »                        | Remplace l'écran portrait actuel                                                                                                                                                          |
| 2.3 | **Transporter le parcours choisi** : `/receita/:slug/cozinhar?path=…`                                                                                                                                                                         | Corrige un vrai bug — la fiche laisse choisir « Forno + Fogão » et la cuisine repart sur `paths[0]`                                                                                       |
| 2.4 | Écran de fin **« Bom apetite »** : modale sur fond flouté, capybara, résumé, « Voltar à receita » / « Salvar no livro »                                                                                                                       | `collections` + `addToCollection()` existent déjà                                                                                                                                         |
| 2.5 | **Son du minuteur** et commande vocale                                                                                                                                                                                                        | `profiles.timer_sound` existe en base et n'est câblé nulle part ; aujourd'hui le minuteur ne fait que vibrer, donc **rien du tout sur iPhone**. Le micro peut réutiliser `useSpeechInput` |
| 2.6 | Persister la session de cuisson                                                                                                                                                                                                               | `startOrResumeSession` / `saveProgress` sont écrits et jamais appelés — reprendre à l'étape 6 après un verrouillage d'écran                                                               |

---

## Phase 3 — Les onglets vides

Deux des cinq onglets ne mènent nulle part. Portrait, entièrement lisibles sur
vos captures, peu de logique : le meilleur rapport valeur/effort après la
phase 2.

| #   | Tâche                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **Meu livro** : « Suas receitas, do seu jeito. », compteurs, « Abrir o livro », liste des coleções avec leur nombre |
| 3.2 | **Mais** : deux groupes (COZINHA / ACOMPANHAMENTO), lignes icône + titre + sous-titre + compteur                    |
| 3.3 | **Favoritos** et **Buscar** en lignes compactes avec compteur de résultats, au lieu des grandes cartes actuelles    |

---

## Phase 4 — La fiche recette

L'ossature est bonne ; il manque six blocs.

| #   | Tâche                                                                               |
| --- | ----------------------------------------------------------------------------------- |
| 4.1 | Ligne de statistiques sous le titre                                                 |
| 4.2 | Bloc « Adaptada ao seu perfil » avec ses coches                                     |
| 4.3 | Onglets (ingrédients / étapes / nutrition)                                          |
| 4.4 | Ingrédients cochables                                                               |
| 4.5 | « Adicionar à lista de compras » — la RPC `add_recipe_to_shopping_list` existe déjà |
| 4.6 | Tableau « Por porção » + avertissement, et CTA « Vamos cozinhar {parcours} »        |
| 4.7 | Corriger le chevauchement du CTA (31 px de contenu masqué, mesuré)                  |

---

## Phase 5 — Onboarding complet

Aujourd'hui : 2 questions sur 7, pas d'accueil, pas de résumé.

| #   | Tâche                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------- |
| 5.1 | Écran d'accueil « Seu chef. Sua cozinha. Do seu jeito. »                                                    |
| 5.2 | Les 5 questions manquantes (niveau, cozinhas, tempo, estilo, restrições) → `profile_preferences`, déjà typé |
| 5.3 | Spécifications d'équipement (« Preferido », capacité) → `profile_equipment.spec`                            |
| 5.4 | Allergies en tags → `profile_disliked_ingredients`                                                          |
| 5.5 | Résumé avec sélecteur de portions et « Explorar receitas »                                                  |

---

## Phase 6 — La ficha (paysage)

`spread` : page double, ingrédients à gauche, étapes à droite. Second écran
paysage, dépend de 1.2. Aujourd'hui un placeholder.

---

## Phase 7 — Le reste

`pantry`, `plan`, `prep`, `shopping`, `diary`, `equipamentos`, `import`. Tous
placeholders, tous avec leur repository déjà écrit et testé par `db:verify`.

---

## Ce qui existe déjà et n'est pas à refaire

- 33 tables, RLS complète, 12 fonctions, vérifiées à chaque `npm run verify`
- Un repository par domaine, avec ses hooks TanStack Query
- Le cache persisté en IndexedDB, scopé par utilisateur et vidé à la déconnexion
- Les tokens Signal Noir, conformes au manifeste (13 valeurs vérifiées)
- Les 6 classes DS réellement utilisées par le prototype
- 32 tests, dont les gardes d'onboarding et du bouton favori

**Environ 40 % du code de `src/` n'est monté par aucun écran** : `features/cook`,
`planning`, `shopping`, `diary`, `pantry`, `collections`. Les phases 2, 3 et 7
consistent largement à brancher ce qui est déjà écrit.

---

## Ordre recommandé

```
0.2  →  1.1 … 1.5  →  2.1 … 2.6  →  3.1 … 3.3  →  4.x  →  5.x  →  6  →  7
```

La phase 1 est un investissement d'une session qui rend la phase 2 possible ;
la phase 2 livre le cœur du produit ; la phase 3 remplit les onglets vides à
faible coût. Les phases 4 à 7 peuvent ensuite être prises dans n'importe quel
ordre selon vos priorités produit.
