/**
 * Reading `magazine_import_items.confidence` back out.
 *
 * The column is `jsonb not null default '{}'`, deliberately shapeless per the
 * migration's own comment — so this is the one place that gives it a shape,
 * mirroring what `replaceWithAssembledItems` (features/magazine-import/api.ts)
 * writes: `ConfidenceScore` plus `verdict`, `findings` and `indexedTitle`.
 * Every reader guards against a missing or malformed value rather than
 * trusting the cast, since nothing in the type system connects the write side
 * to the read side of a `Json` column.
 */
import type { Json } from '@/lib/supabase/database.types';
import type { ConfidenceScore, RecipeVerdict } from './types.ts';

export interface ItemConfidence {
  score: ConfidenceScore;
  verdict: RecipeVerdict;
  findings: string[];
  indexedTitle: string | null;
}

const VERDICTS: readonly RecipeVerdict[] = ['ready', 'review', 'problem'];

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Never throws. A malformed or empty blob reads as the most cautious verdict. */
export function readItemConfidence(raw: Json): ItemConfidence {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const verdictValue = record['verdict'];
  const verdict = VERDICTS.includes(verdictValue as RecipeVerdict)
    ? (verdictValue as RecipeVerdict)
    : 'problem';

  return {
    score: {
      overall: readNumber(record['overall']),
      title: readNumber(record['title']),
      ingredients: readNumber(record['ingredients']),
      steps: readNumber(record['steps']),
    },
    verdict,
    findings: Array.isArray(record['findings'])
      ? record['findings'].filter((entry): entry is string => typeof entry === 'string')
      : [],
    indexedTitle: typeof record['indexedTitle'] === 'string' ? record['indexedTitle'] : null,
  };
}
