import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { FavoriteButton } from '@/components/FavoriteButton';
import { DataLabel } from '@/components/ui/Card';
import { RecipeImage } from '@/components/ui/RecipeImage';
import { equipmentLabel, visibleEquipment } from '@/domain/equipment';
import type { ChefMode, RecipeCard } from '@/domain/types';
import { formatDuration, formatGrams, formatKcal, formatServings } from '@/lib/format';

/**
 * The recipe card from the concept document: photo, title, the three timing
 * facts, then nutrition and the appliances it works with.
 */
export function RecipeCardItem({
  recipe,
  mode = 'normal',
}: {
  recipe: RecipeCard;
  mode?: ChefMode;
}) {
  const nutrition = recipe.variants[mode] ?? recipe.variants.normal;
  const equipment = visibleEquipment(recipe.equipment);

  return (
    // The heart is a sibling of the link, not a child: a button inside an
    // anchor is invalid HTML and unreachable for keyboard and screen readers.
    <div className="relative">
      <FavoriteButton recipe={recipe} className="absolute top-3 right-3 z-10" />

      <Link
        to={routes.recipe(recipe.slug)}
        className="block overflow-hidden rounded-lg border border-hairline bg-card no-underline"
      >
        <RecipeImage
          src={recipe.heroImageUrl}
          className="aspect-[16/10] w-full"
          fallback={<DataLabel>Sem foto</DataLabel>}
        />

        <div className="flex flex-col gap-2 p-4">
          <h3 className="font-sans text-heading font-semibold text-ink">{recipe.title}</h3>

          <p className="text-small text-ink-muted">
            {formatDuration(recipe.totalMinutes)} · {formatServings(recipe.defaultServings)} ·{' '}
            {recipe.difficulty === 'facil'
              ? 'Fácil'
              : recipe.difficulty === 'medio'
                ? 'Médio'
                : 'Difícil'}
          </p>

          {nutrition ? (
            <p className="text-small text-ink">
              {formatKcal(nutrition.kcal)} · {formatGrams(nutrition.protein_g)} de proteína
            </p>
          ) : null}

          {equipment.length > 0 ? (
            <DataLabel>{equipment.map(equipmentLabel).join(' · ')}</DataLabel>
          ) : null}
        </div>
      </Link>
    </div>
  );
}
