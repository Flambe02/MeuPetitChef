import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { DataLabel } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { useCollections, useFavorites } from '@/features/favorites/hooks';

/**
 * "Meu livro" — the user's own cookbook: everything they saved, and the
 * collections they filed it under.
 *
 * The counts are read, never guessed: an empty book says so rather than showing
 * a hopeful zero next to a list of collections that do not exist.
 */
export default function BookScreen() {
  const favorites = useFavorites();
  const collections = useCollections();

  const recipeCount = favorites.data?.length ?? 0;
  const collectionCount = collections.data?.length ?? 0;
  const isPending = favorites.isPending || collections.isPending;

  return (
    <div className="animate-in px-5 pt-1 pb-7">
      <DataLabel tone="signal">Meu Livro</DataLabel>

      <h1 className="mt-3 mb-1.5 font-display text-[30px] font-bold tracking-[-0.03em] text-ink">
        Suas receitas, do seu jeito.
      </h1>
      <p className="mb-5 text-small text-ink-muted">
        {isPending
          ? '…'
          : `${recipeCount} ${recipeCount === 1 ? 'receita' : 'receitas'} · ${collectionCount} ${
              collectionCount === 1 ? 'coleção' : 'coleções'
            }`}
      </p>

      <Link
        to={routes.favorites}
        className="flex h-[50px] w-full items-center justify-center rounded-lg bg-graphite-900 text-body font-semibold text-porcelain-100 no-underline"
      >
        Abrir o livro
      </Link>

      <DataLabel className="mt-6.5 mb-3 block">Coleções</DataLabel>

      {collections.isPending ? <Spinner /> : null}
      {collections.isError ? (
        <ErrorState error={collections.error} onRetry={() => void collections.refetch()} />
      ) : null}

      {!collections.isPending && collectionCount === 0 ? (
        <EmptyState
          title="Nenhuma coleção ainda"
          description="Agrupe suas receitas por ocasião — «Almoços rápidos», «Air fryer», «Receitas de família»."
        />
      ) : null}

      <div className="flex flex-col gap-2">
        {collections.data?.map((collection) => (
          <Link
            key={collection.id}
            to={routes.book}
            className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-raised p-4 no-underline"
          >
            <span className="text-body font-medium text-ink">{collection.name}</span>
            <span className="font-mono text-[13px] text-ink-muted">{collection.emoji ?? ''}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
