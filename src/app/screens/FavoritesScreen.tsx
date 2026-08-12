import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { RecipeRow } from '@/components/RecipeRow';
import { DataLabel } from '@/components/ui/Card';
import { ErrorState, Spinner } from '@/components/ui/states';
import { useFavorites } from '@/features/favorites/hooks';

export default function FavoritesScreen() {
  const favorites = useFavorites();
  const isEmpty = !favorites.isPending && (favorites.data?.length ?? 0) === 0;

  return (
    <div className="animate-in px-5 pt-1 pb-7">
      <h1 className="mb-4.5 font-display text-[30px] font-bold tracking-[-0.03em] text-ink">
        Favoritos
      </h1>

      {favorites.isPending ? <Spinner /> : null}
      {favorites.isError ? (
        <ErrorState error={favorites.error} onRetry={() => void favorites.refetch()} />
      ) : null}

      {isEmpty ? (
        <div className="rounded-xl border border-hairline bg-raised p-4.5">
          <DataLabel>Nada salvo</DataLabel>
          <p className="mt-3 text-body leading-[1.5] text-ink-secondary">
            Toque no coração de uma receita para guardá-la aqui.
          </p>
          <Link
            to={routes.search}
            className="mt-4 inline-flex h-[46px] items-center rounded-lg border border-strong px-4 text-[14px] font-semibold text-ink no-underline"
          >
            Buscar receitas
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {favorites.data?.map((recipe) => (
          <RecipeRow key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </div>
  );
}
