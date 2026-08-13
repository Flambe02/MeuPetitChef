import { classifyProtein } from './protein';
import type { PlannedEntry, ProteinType, WeeklyVarietyReport } from './types';

const PROTEIN_TYPES: ProteinType[] = ['frango', 'peixe', 'carne', 'ovo', 'vegetal', 'outro'];

const PROTEIN_LABEL: Record<ProteinType, string> = {
  frango: 'Frango',
  peixe: 'Peixe',
  carne: 'Carne',
  ovo: 'Ovos',
  vegetal: 'Vegetal',
  outro: 'Outros',
};

/**
 * "Variedade da semana" — a count per protein type plus one deterministic
 * score. Two ingredients, on purpose, per the brief: this is a readable
 * summary, not a model — `generateWeeklyMealPlan`'s own variety penalty is
 * where the actual anti-repetition decisions get made.
 *
 * Score: 100 minus one point per percentage point the most-used protein sits
 * above 40% of the week's filled slots. A week split 3/2/2/1/2 across five
 * types (like the brief's own example) never crosses that line and scores
 * 100; a week that is two-thirds chicken loses about 27 points.
 */
export function computeWeeklyVariety(entries: PlannedEntry[]): WeeklyVarietyReport {
  const counts: Record<ProteinType, number> = {
    frango: 0,
    peixe: 0,
    carne: 0,
    ovo: 0,
    vegetal: 0,
    outro: 0,
  };

  let total = 0;
  for (const { entry, recipe } of entries) {
    if (entry.entry_type !== 'recipe' && entry.entry_type !== 'leftover') continue;
    if (!recipe) continue;
    counts[classifyProtein(recipe)] += 1;
    total += 1;
  }

  if (total === 0) {
    return { proteinCounts: counts, score: 100, dominant: null, suggestion: null };
  }

  let dominant: ProteinType = 'outro';
  for (const type of PROTEIN_TYPES) {
    if (counts[type] > counts[dominant]) dominant = type;
  }
  const dominantShare = counts[dominant] / total;

  const penalty = Math.max(0, dominantShare - 0.4) * 100;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  const suggestion =
    dominant !== 'outro' && dominantShare > 0.5
      ? `Sua semana tem muito ${PROTEIN_LABEL[dominant].toLowerCase()}. Trocar um prato?`
      : null;

  return { proteinCounts: counts, score, dominant: counts[dominant] > 0 ? dominant : null, suggestion };
}

export { PROTEIN_LABEL };
