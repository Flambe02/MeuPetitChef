-- ============================================================================
-- Meu Petit Chef — 14. Une recette importée est une référence, pas du contenu
--
-- Migration 13 a rendu l'import possible. Celle-ci en fixe la limite.
--
-- Les CGU de Cookomix nomment explicitement « les recettes » et interdisent
-- « toute reproduction, représentation, modification, publication, adaptation »
-- sans autorisation écrite. Le droit sui generis des bases de données s'y
-- ajoute pour un éditeur français. Une recette importée peut donc servir de
-- référence privée — lire comment un plat se fait, avec quels paramètres — mais
-- ne peut pas devenir du catalogue publié.
--
-- La règle est mise ici plutôt que dans le code applicatif parce qu'un
-- back-office, un script ou un `update` à la main la contourneraient sans le
-- vouloir. Une contrainte, elle, tient pour tout le monde.
--
-- Le chemin prévu reste ouvert : on extrait les faits (plat, ingrédients,
-- temps, températures — non protégeables), on génère une recette originale
-- adaptée aux appareils de la personne, et *celle-là* n'a pas de
-- `source_provider`. Elle se publie normalement.
-- ============================================================================

alter table public.recipes
  add constraint imported_recipe_stays_reference
  check (source_provider is null or status <> 'published');

comment on constraint imported_recipe_stays_reference on public.recipes is
  'Une recette importée d''un site tiers reste une référence privée. Le contenu publié doit être original — voir docs/recipe-importers.md.';

comment on column public.recipes.source_provider is
  'Renseigné uniquement sur les références importées. Sa présence interdit la publication.';
