import { Check } from 'lucide-react';

import type { Profile } from '@/domain/types';
import { brand } from '@/config/brand';
import type { DailyNutrition } from '@/lib/planning/types';

const kcalFormatter = new Intl.NumberFormat(brand.locale, { maximumFractionDigits: 0 });

/**
 * "1.790 kcal · 136 g proteína ✓" — the one nutrition line a day gets. A
 * checkmark when protein clears the daily goal, a quiet nudge when it
 * doesn't; calories are informational only; this stays a cooking app, not a
 * tracker, per the brief.
 */
export function DaySummary({ nutrition, profile }: { nutrition: DailyNutrition; profile: Profile | null }) {
  if (nutrition.kcal <= 0 && nutrition.proteinG <= 0) return null;

  const goal = profile?.daily_protein_goal_g ?? null;
  const meetsGoal = goal !== null && nutrition.proteinG >= goal * 0.9;

  return (
    <p className="mt-2 flex items-center gap-1.5 text-small text-ink-muted">
      <span>
        {kcalFormatter.format(Math.round(nutrition.kcal))} kcal · {Math.round(nutrition.proteinG)} g proteína
      </span>
      {goal !== null ? (
        meetsGoal ? (
          <Check aria-hidden className="size-3.5 text-rouge" strokeWidth={2.25} />
        ) : (
          <span className="text-[11px] font-mono text-ink-muted">↑ proteína</span>
        )
      ) : null}
    </p>
  );
}
