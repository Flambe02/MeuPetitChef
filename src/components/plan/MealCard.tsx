import { Check, Lock, MoreHorizontal, Recycle, UtensilsCrossed } from 'lucide-react';

import { RecipeImage } from '@/components/ui/RecipeImage';
import { EQUIPMENT_THEME, visibleEquipment } from '@/domain/equipment';
import type { ChefMode } from '@/domain/types';
import { formatDuration, formatGrams, formatKcal } from '@/lib/format';
import type { PlannedEntry } from '@/lib/planning/types';

/** "420 kcal · 38g proteína" — kcal/protein for the entry's own mode, falling back to normal. */
function macroLine(planned: PlannedEntry, mode: ChefMode): string | null {
  const variant = planned.recipe?.variants[planned.entry.mode ?? mode] ?? planned.recipe?.variants.normal;
  if (!variant) return null;
  const parts = [formatKcal(variant.kcal), variant.protein_g === null ? null : `${formatGrams(variant.protein_g)} proteína`];
  return parts.filter(Boolean).join(' · ') || null;
}

/** "25 min · Thermomix" — duration plus the first appliance the recipe actually needs. */
function timeLine(planned: PlannedEntry): string | null {
  if (!planned.recipe) return null;
  const equipment = visibleEquipment(planned.recipe.equipment)[0];
  const parts = [formatDuration(planned.recipe.totalMinutes), equipment ? EQUIPMENT_THEME[equipment].short : null];
  return parts.filter(Boolean).join(' · ') || null;
}

/**
 * One filled slot — almoço or jantar, whatever it turned out to be: a
 * recipe, a leftover pointing at one, an eating-out plan, or a slot the
 * person deliberately left without a meal. `EmptySlotCard` is the sibling for
 * when the row doesn't exist yet at all.
 */
export function MealCard({
  planned,
  mode,
  onOpenMenu,
  onOpenRecipe,
}: {
  planned: PlannedEntry;
  mode: ChefMode;
  onOpenMenu: () => void;
  onOpenRecipe?: () => void;
}) {
  const { entry, recipe } = planned;

  const title =
    entry.entry_type === 'eating_out'
      ? (entry.custom_title ?? 'Comer fora')
      : entry.entry_type === 'skipped'
        ? 'Sem refeição planejada'
        : entry.entry_type === 'leftover'
          ? `Restos${recipe ? ` de ${recipe.title}` : ''}`
          : (recipe?.title ?? entry.custom_title ?? 'Receita');

  const muted = entry.entry_type === 'skipped';
  const macros = entry.entry_type === 'recipe' || entry.entry_type === 'leftover' ? macroLine(planned, mode) : null;
  const time = entry.entry_type === 'recipe' || entry.entry_type === 'leftover' ? timeLine(planned) : null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-hairline bg-raised p-3">
      {entry.entry_type === 'eating_out' || entry.entry_type === 'skipped' ? (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-inset text-ink-muted">
          {entry.entry_type === 'eating_out' ? (
            <UtensilsCrossed aria-hidden className="size-6" strokeWidth={1.5} />
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenRecipe}
          disabled={!onOpenRecipe}
          className="size-14 shrink-0 overflow-hidden rounded-md"
        >
          <RecipeImage src={recipe?.heroImageUrl ?? null} className="size-full rounded-md" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {entry.entry_type === 'leftover' ? (
            <Recycle aria-hidden className="size-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
          ) : null}
          <span
            className={`truncate text-body font-medium ${muted ? 'text-ink-muted' : 'text-ink'}`}
          >
            {title}
          </span>
          {entry.locked ? (
            <Lock aria-hidden className="size-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
          ) : null}
          {entry.status === 'cooked' ? (
            <Check aria-hidden className="size-3.5 shrink-0 text-rouge" strokeWidth={2} />
          ) : null}
        </div>
        {macros ? <p className="mt-1 text-small text-ink-muted">{macros}</p> : null}
        {time ? <p className="mt-0.5 text-small text-ink-muted">{time}</p> : null}
      </div>

      <button
        type="button"
        aria-label="Mais ações"
        onClick={onOpenMenu}
        className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-pill text-ink-muted"
      >
        <MoreHorizontal aria-hidden className="size-[18px]" />
      </button>
    </div>
  );
}
