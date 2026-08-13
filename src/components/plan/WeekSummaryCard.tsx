import { Card, CardTitle, DataLabel } from '@/components/ui/Card';
import { brand } from '@/config/brand';
import { formatDuration } from '@/lib/format';
import type { PlannedEntry, WeeklyNutrition } from '@/lib/planning/types';

const kcalFormatter = new Intl.NumberFormat(brand.locale, { maximumFractionDigits: 0 });

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-heading font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-small text-ink-muted">{label}</p>
    </div>
  );
}

/**
 * "RESUMO DA SEMANA" — counted straight off `entries`, nothing estimated.
 * A distinct-ingredient count is deliberately left out: `RecipeCard` (what
 * the week's entries resolve to) carries tags, not ingredient lists, and
 * fetching every recipe's full detail just to count ingredients would be the
 * N+1 `recipe_cards` exists specifically to avoid.
 */
export function WeekSummaryCard({
  entries,
  nutrition,
}: {
  entries: PlannedEntry[];
  nutrition: WeeklyNutrition;
}) {
  const meals = entries.filter((planned) => planned.entry.entry_type !== 'skipped');
  if (meals.length === 0) return null;

  const recipeIds = new Set(
    entries
      .filter((planned) => planned.entry.entry_type === 'recipe' && planned.entry.recipe_id)
      .map((planned) => planned.entry.recipe_id!),
  );
  const eatingOut = entries.filter((planned) => planned.entry.entry_type === 'eating_out').length;
  const leftovers = entries.filter((planned) => planned.entry.entry_type === 'leftover').length;

  // Leftovers add no cooking time of their own — the recipe they came from
  // already paid for it under its own `entry_type: 'recipe'` row.
  const cookingMinutes = entries
    .filter((planned) => planned.entry.entry_type === 'recipe' && planned.recipe)
    .reduce((total, planned) => total + (planned.recipe?.totalMinutes ?? 0), 0);

  return (
    <Card accent className="p-4">
      <CardTitle>Resumo da semana</CardTitle>

      <div className="mt-4 grid grid-cols-2 gap-y-4">
        <Stat value={String(meals.length)} label={meals.length === 1 ? 'refeição' : 'refeições'} />
        <Stat value={String(recipeIds.size)} label={recipeIds.size === 1 ? 'receita' : 'receitas'} />
        {eatingOut > 0 ? (
          <Stat value={String(eatingOut)} label={eatingOut === 1 ? 'refeição fora' : 'refeições fora'} />
        ) : null}
        {leftovers > 0 ? (
          <Stat
            value={String(leftovers)}
            label={leftovers === 1 ? 'refeição reaproveitada' : 'refeições reaproveitadas'}
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-hairline pt-3">
        <DataLabel
          value={`≈ ${kcalFormatter.format(Math.round(nutrition.avgKcal))} kcal · ${Math.round(nutrition.avgProteinG)} g proteína`}
        >
          Média diária
        </DataLabel>
        {cookingMinutes > 0 ? (
          <DataLabel value={`${formatDuration(cookingMinutes)} / semana`}>Tempo de cozinha</DataLabel>
        ) : null}
      </div>
    </Card>
  );
}
