import { equipmentLabel, visibleEquipment } from '@/domain/equipment';
import type { ChefMode, EquipmentType, RecipeCard } from '@/domain/types';

/** One justification line under the home screen's suggestion. */
export interface SuggestionReason {
  /** Lucide icon name, matching the prototype's own choices. */
  icon: 'leaf' | 'fan' | 'zap' | 'clock';
  text: string;
}

/**
 * Why *this* recipe, right now.
 *
 * The prototype hardcodes three reasons per suggestion; here they are derived,
 * so a suggestion never claims a fit it does not have. A reason that cannot be
 * computed from the data is simply not shown — an empty list is better than a
 * decorative one.
 */
export function suggestionReasons(
  recipe: RecipeCard,
  mode: ChefMode,
  ownedEquipment: readonly EquipmentType[],
): SuggestionReason[] {
  const reasons: SuggestionReason[] = [];

  if (recipe.variants[mode]) {
    reasons.push({ icon: 'leaf', text: 'Adaptada ao seu perfil' });
  }

  const needed = visibleEquipment(recipe.equipment);
  const matched = needed.filter((item) => ownedEquipment.includes(item));
  if (needed.length > 0 && matched.length === needed.length) {
    reasons.push({
      icon: 'fan',
      text:
        matched.length === 1
          ? `Compatível com a sua ${equipmentLabel(matched[0]!)}`
          : `Compatível com a sua cozinha (${matched.map(equipmentLabel).join(' + ')})`,
    });
  }

  // Only meaningful against the baseline the user is *not* looking at.
  const active = recipe.variants[mode]?.kcal;
  const baseline = recipe.variants.normal?.kcal;
  if (mode !== 'normal' && active !== null && active !== undefined && baseline) {
    const delta = Math.round(baseline - active);
    if (delta > 0) reasons.push({ icon: 'zap', text: `${delta} kcal a menos` });
  }

  if (reasons.length < 3 && recipe.totalMinutes > 0 && recipe.totalMinutes <= 30) {
    reasons.push({ icon: 'clock', text: `Pronta em ${recipe.totalMinutes} minutos` });
  }

  return reasons.slice(0, 3);
}

const SLOTS = [
  { until: 10, label: 'Café da manhã' },
  { until: 14, label: 'Almoço' },
  { until: 18, label: 'Lanche' },
  { until: 22, label: 'Jantar' },
] as const;

/** "Almoço · Hoje" — the mono eyebrow in the home header. */
export function mealSlotLabel(now: Date = new Date()): string {
  const hour = now.getHours();
  const slot = SLOTS.find((entry) => hour < entry.until)?.label ?? 'Ceia';
  return `${slot} · Hoje`;
}
