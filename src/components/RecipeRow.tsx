import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { RecipeImage } from '@/components/ui/RecipeImage';
import { recipeMeta, recipeMetaShort } from '@/domain/recipe-meta';
import type { ChefMode, RecipeCard } from '@/domain/types';

function Thumb({ url, className }: { url: string | null; className: string }) {
  return <RecipeImage src={url} className={`${className} shrink-0`} />;
}

/** A dense list row: thumbnail, title, mono meta, chevron. Used by Favoritos. */
export function RecipeRow({ recipe }: { recipe: RecipeCard }) {
  return (
    <Link
      to={routes.recipe(recipe.slug)}
      className="flex w-full items-center gap-3.5 border-b border-hairline py-3.5 no-underline"
    >
      <Thumb url={recipe.heroImageUrl} className="size-14 rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{recipe.title}</span>
        <span className="mt-1.5 block font-mono text-[11px] tracking-[0.1em] text-ink-muted uppercase">
          {recipeMeta(recipe)}
        </span>
      </span>
      <span aria-hidden className="text-[16px] text-ink-muted">
        ›
      </span>
    </Link>
  );
}

/** A two-column grid tile: image on top, title, mono meta. Used by Buscar. */
export function RecipeTile({ recipe, mode }: { recipe: RecipeCard; mode: ChefMode }) {
  return (
    <Link
      to={routes.recipe(recipe.slug)}
      className="overflow-hidden rounded-lg border border-hairline bg-raised no-underline"
    >
      <Thumb url={recipe.heroImageUrl} className="h-24 w-full" />
      <span className="block p-3">
        <span className="block text-small leading-[1.3] font-semibold text-ink">
          {recipe.title}
        </span>
        <span className="mt-2 block font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">
          {recipeMetaShort(recipe, mode)}
        </span>
      </span>
    </Link>
  );
}
