import type { RecipeCard } from '@/domain/types';
import { fold } from '@/lib/recipe-import/text';

import type { ProteinType } from './types';

/**
 * `recipes` has no `protein_type` column (migration 03 never needed one — a
 * recipe card renders fine without it) and `recipe_cards` exposes only free
 * text (`title`, `cuisine`, `category`) plus `tags`. Rather than add a column
 * no screen reads yet, the weekly planner classifies off that same text — a
 * heuristic, not a fact from the database, and named accordingly.
 */
const KEYWORDS: Record<Exclude<ProteinType, 'outro'>, string[]> = {
  frango: ['frango', 'galinha', 'galeto', 'peru'],
  peixe: [
    'peixe',
    'salmao',
    'tilapia',
    'atum',
    'bacalhau',
    'camarao',
    'fruto do mar',
    'frutos do mar',
    'polvo',
    'lula',
  ],
  carne: [
    'carne',
    'bovina',
    'boi',
    'bife',
    'vitela',
    'porco',
    'suino',
    'bacon',
    'linguica',
    'costela',
    'cordeiro',
  ],
  ovo: ['ovo', 'ovos', 'omelete', 'omelette'],
  vegetal: ['vegetariano', 'vegano', 'legume', 'legumes', 'tofu', 'grao-de-bico', 'lentilha', 'quinoa'],
};

/**
 * A best-effort protein category for one recipe, from its title/cuisine/
 * category/tags. Never throws, never returns anything outside `ProteinType` —
 * `'outro'` is the honest answer when nothing matches, not an error.
 */
export function classifyProtein(recipe: RecipeCard): ProteinType {
  const haystack = fold(
    [recipe.title, recipe.cuisine, recipe.category, ...recipe.tags].filter(Boolean).join(' '),
  );

  for (const [type, keywords] of Object.entries(KEYWORDS) as [
    Exclude<ProteinType, 'outro'>,
    string[],
  ][]) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return type;
  }
  return 'outro';
}
