import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecipeCard } from '@/domain/types';

import { FavoriteButton } from './FavoriteButton';

/**
 * A fake server with a hand-operated valve.
 *
 * `addFavorite` hangs until the test opens `gate`, which is the only way to
 * observe the optimistic window: with an instantly-resolved promise the write,
 * the invalidation and the refetch all land inside `await user.click()`, and the
 * assertion would pass just as happily against a non-optimistic mutation.
 */
let stored: RecipeCard[] = [];
let gate: { settle: () => void; fail: () => void };

vi.mock('@/features/favorites/api', () => ({
  listFavorites: vi.fn(() => Promise.resolve(stored)),
  listCollections: vi.fn(() => Promise.resolve([])),
  addFavorite: vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        gate = {
          settle: () => {
            stored = [RECIPE, ...stored];
            resolve();
          },
          fail: () => reject(new Error('offline')),
        };
      }),
  ),
  removeFavorite: vi.fn((_userId: string, recipeId: string) => {
    stored = stored.filter((entry) => entry.id !== recipeId);
    return Promise.resolve();
  }),
}));

vi.mock('@/features/auth/session-context', () => ({
  useSession: () => ({ session: null, user: { id: 'user-1' }, isLoading: false }),
}));

const RECIPE = {
  id: 'recipe-1',
  slug: 'strogonoff',
  title: 'Strogonoff de frango',
  subtitle: null,
  heroImagePath: null,
  heroImageUrl: null,
  authorName: 'Petit Chef',
  cuisine: null,
  category: null,
  difficulty: 'facil',
  totalMinutes: 30,
  activeMinutes: 15,
  defaultServings: 2,
  ratingAvg: 4.5,
  ratingCount: 12,
  equipment: [],
  tags: [],
  variants: {},
} satisfies RecipeCard;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Renders and waits for the initial favourites read to land. */
async function renderHeart() {
  render(<FavoriteButton recipe={RECIPE} />, { wrapper });
  await waitFor(() => {
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
  return screen.getByRole('button');
}

describe('FavoriteButton', () => {
  beforeEach(() => {
    stored = [];
    vi.clearAllMocks();
  });

  it('turns the heart on before the write comes back', async () => {
    const user = userEvent.setup();
    const heart = await renderHeart();
    expect(heart).toHaveAttribute('aria-pressed', 'false');

    await user.click(heart);

    // The write is still in flight — this is the optimistic state.
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    expect(heart).toHaveAccessibleName('Remover Strogonoff de frango dos favoritos');

    gate.settle();
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('rolls the heart back when the write fails', async () => {
    const user = userEvent.setup();
    const heart = await renderHeart();

    await user.click(heart);
    expect(heart).toHaveAttribute('aria-pressed', 'true');

    gate.fail();

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    });
    expect(stored).toHaveLength(0);
  });

  it('unsaves a recipe that was already a favourite', async () => {
    stored = [RECIPE];
    const user = userEvent.setup();
    render(<FavoriteButton recipe={RECIPE} />, { wrapper });

    const heart = await screen.findByRole('button', {
      name: 'Remover Strogonoff de frango dos favoritos',
    });

    await user.click(heart);

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAccessibleName('Salvar Strogonoff de frango');
    });
    expect(stored).toHaveLength(0);
  });
});
