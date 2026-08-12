import { Heart } from 'lucide-react';
import type { MouseEvent } from 'react';

import type { RecipeCard } from '@/domain/types';
import { useIsFavorite, useToggleFavorite } from '@/features/favorites/hooks';
import { cn } from '@/lib/cn';

/**
 * The heart. Sized for a thumb (44 px) because it is tapped with one hand while
 * the other holds a phone over a pan.
 *
 * It stops propagation: on a recipe card the heart sits on top of the link to
 * the recipe, and tapping it must not navigate.
 */
export function FavoriteButton({ recipe, className }: { recipe: RecipeCard; className?: string }) {
  const isFavorite = useIsFavorite(recipe.id);
  const toggle = useToggleFavorite();

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggle.mutate({ recipe, next: !isFavorite });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Remover ${recipe.title} dos favoritos` : `Salvar ${recipe.title}`}
      className={cn(
        'flex size-11 items-center justify-center rounded-pill border border-hairline',
        'bg-raised/90 backdrop-blur transition-colors duration-[140ms] ease-signal',
        className,
      )}
    >
      <Heart
        aria-hidden
        className={cn('size-5', isFavorite ? 'fill-rouge text-rouge' : 'text-ink-muted')}
      />
    </button>
  );
}
