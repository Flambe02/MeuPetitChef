import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { IngredientLine, RecipeDetail } from '@/domain/types';
import { LanguageProvider } from '@/lib/i18n/LanguageProvider';

import RecipeScreen from './RecipeScreen';

/**
 * "Muda as porções, muda as quantidades."
 *
 * Written because the behaviour was reported as broken, and reading the code was
 * not enough to settle it: `scaleQuantity` is unit-aware on purpose, so a recipe
 * whose lines are `count` or `pinch` legitimately shows the *same* numbers after
 * a small change — "1,25 cebolas" is not an improvement. This test therefore
 * asserts both halves: what must move, and what must not.
 */

const line = (over: Partial<IngredientLine>): IngredientLine => ({
  id: 'x',
  groupId: 'g1',
  groupName: 'Ingredientes',
  ingredientId: null,
  displayName: 'Ingrediente',
  quantity: 100,
  unit: 'g',
  unitKind: 'mass',
  note: null,
  isOptional: false,
  isScalable: true,
  variantChange: null,
  ...over,
});

const RECIPE: RecipeDetail = {
  id: 'r1',
  slug: 'lasanha',
  title: 'Lasanha',
  subtitle: null,
  description: null,
  status: 'published',
  heroImagePath: null,
  heroImageUrl: null,
  authorName: 'Petit Chef',
  cuisine: null,
  category: null,
  difficulty: 'facil',
  totalMinutes: 60,
  activeMinutes: 20,
  defaultServings: 4,
  ratingAvg: 4.5,
  ratingCount: 10,
  equipment: [],
  tags: [],
  variants: {},
  groups: [
    {
      id: 'g1',
      name: 'Ingredientes',
      items: [
        line({ id: 'i1', displayName: 'Leite', quantity: 500, unit: 'ml', unitKind: 'volume' }),
        line({ id: 'i2', displayName: 'Cebola', quantity: 1, unit: 'un.', unitKind: 'count' }),
        line({
          id: 'i3',
          displayName: 'Noz-moscada',
          quantity: 1,
          unit: 'pitada',
          unitKind: 'pinch',
        }),
        // What an imported recipe looks like when the source gave no amount.
        line({ id: 'i4', displayName: 'Sal', quantity: null, unit: null, unitKind: 'to_taste' }),
      ],
    },
  ],
  paths: [],
  notes: [],
};

vi.mock('@/features/recipes/hooks', () => ({
  useRecipe: () => ({ data: RECIPE, isPending: false, isError: false, error: null }),
  useSetRecipePhoto: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: { chef_mode: 'normal' } }),
  useUpdateProfile: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/features/auth/session-context', () => ({
  useSession: () => ({ session: null, user: null, isLoading: false }),
}));

vi.mock('@/features/shopping/hooks', () => ({
  useAddRecipeToList: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/components/FavoriteButton', () => ({ FavoriteButton: () => null }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/receita/lasanha']}>
        <LanguageProvider>{children}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The amount printed on an ingredient row, read off its accessible name. */
function amountOf(name: string): string {
  const row = screen.getByRole('button', { name: new RegExp(name) });
  return row.textContent ?? '';
}

async function openIngredients() {
  const user = userEvent.setup();
  render(<RecipeScreen />, { wrapper });
  await user.click(screen.getByRole('tab', { name: 'Ingredientes' }));
  return user;
}

describe('RecipeScreen — porções', () => {
  it('rescales mass and volume lines when the serving count changes', async () => {
    const user = await openIngredients();

    expect(amountOf('Leite')).toContain('500 ml');

    await user.click(screen.getByRole('button', { name: 'Mais porções' }));
    await user.click(screen.getByRole('button', { name: 'Mais porções' }));

    // 4 → 6 servings, factor 1.5. The readout appears twice — in the header
    // stats and next to the stepper — and both must agree.
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
    expect(amountOf('Leite')).toContain('750 ml');
  });

  it('leaves "a gosto" and pinch lines alone, and never invents an amount', async () => {
    const user = await openIngredients();

    await user.click(screen.getByRole('button', { name: 'Mais porções' }));
    await user.click(screen.getByRole('button', { name: 'Mais porções' }));

    // A pinch of nutmeg does not become 1.5 pinches, and salt "a gosto" has no
    // number to scale — this is why a recipe made only of such lines looks
    // unchanged, and it is correct.
    expect(amountOf('Noz-moscada')).toContain('1 pitada');
    expect(amountOf('Sal')).not.toMatch(/\d/);
  });

  it('rounds count lines to whole units', async () => {
    const user = await openIngredients();

    // 4 → 5 servings, factor 1.25: one onion stays one onion.
    await user.click(screen.getByRole('button', { name: 'Mais porções' }));
    expect(amountOf('Cebola')).toContain('1 un.');

    // 4 → 8, factor 2: now it is two.
    for (let click = 0; click < 3; click += 1) {
      await user.click(screen.getByRole('button', { name: 'Mais porções' }));
    }
    expect(amountOf('Cebola')).toContain('2 un.');
  });
});
