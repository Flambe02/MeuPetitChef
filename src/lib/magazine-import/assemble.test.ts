import { describe, expect, it } from 'vitest';

import { assembleRecipes } from './assemble';
import { scoreRecipe } from './confidence';
import type { MagazineRecipe } from './types';

const recipe = (over: Partial<MagazineRecipe> & { title: string }): MagazineRecipe => ({
  description: null,
  servings: 4,
  prepMinutes: 20,
  cookMinutes: 15,
  restMinutes: null,
  ingredients: [
    { quantity: 1, unit: 'kg', ingredient: 'tomates', preparation: null, optional: false },
    { quantity: 2, unit: null, ingredient: 'gousses d’ail', preparation: null, optional: false },
  ],
  steps: [
    { order: 1, instruction: 'Pelez les tomates et coupez-les grossièrement.' },
    { order: 2, instruction: 'Mixez le tout avec l’huile et le vinaigre.' },
  ],
  tips: [],
  notes: [],
  language: 'fr',
  continuationBefore: false,
  continuationAfter: false,
  reportedConfidence: { overall: 0.95, title: 0.99, ingredients: 0.96, steps: 0.94 },
  ...over,
});

describe('assembleRecipes', () => {
  it('keeps two recipes on one page apart', () => {
    const assembled = assembleRecipes([
      {
        pageIndex: 60,
        recipes: [
          recipe({ title: 'Brochettes de crevettes et courgettes' }),
          recipe({ title: 'Crevettes à la bisque de homard' }),
        ],
      },
    ]);

    expect(assembled).toHaveLength(2);
    expect(assembled.map((entry) => entry.blockIndex)).toEqual([0, 1]);
    expect(assembled.every((entry) => entry.pages.length === 1)).toBe(true);
  });

  it('joins a recipe that runs onto the next page', () => {
    const assembled = assembleRecipes([
      {
        pageIndex: 58,
        recipes: [
          recipe({
            title: 'Risotto de courgettes',
            continuationAfter: true,
            steps: [{ order: 1, instruction: 'Faites revenir l’oignon dans l’huile chaude.' }],
          }),
        ],
      },
      {
        pageIndex: 59,
        recipes: [
          recipe({
            title: 'Risotto de courgettes',
            continuationBefore: true,
            ingredients: [],
            steps: [{ order: 1, instruction: 'Ajoutez le riz et nacrez-le deux minutes.' }],
          }),
        ],
      },
    ]);

    expect(assembled).toHaveLength(1);
    expect(assembled[0]?.pages).toEqual([58, 59]);
    // Renumbered as one sequence, not two starting at 1.
    expect(assembled[0]?.recipe.steps.map((step) => step.order)).toEqual([1, 2]);
  });

  it('does not double the ingredients a jump page reprints', () => {
    const assembled = assembleRecipes([
      { pageIndex: 58, recipes: [recipe({ title: 'Risotto', continuationAfter: true })] },
      { pageIndex: 59, recipes: [recipe({ title: 'Risotto', continuationBefore: true })] },
    ]);

    expect(assembled[0]?.recipe.ingredients).toHaveLength(2);
  });

  it('refuses to join across a gap in the pages', () => {
    // "Suite p. 74" is real, and unhandled on purpose: welding two halves that
    // are fifteen pages apart on a title match would join the wrong pair the
    // first time a magazine ran two takes on one dish.
    const assembled = assembleRecipes([
      { pageIndex: 58, recipes: [recipe({ title: 'Risotto', continuationAfter: true })] },
      { pageIndex: 74, recipes: [recipe({ title: 'Risotto', continuationBefore: true })] },
    ]);

    expect(assembled).toHaveLength(2);
  });

  it('never calls a half-recipe ready', () => {
    const assembled = assembleRecipes([
      { pageIndex: 58, recipes: [recipe({ title: 'Risotto', continuationAfter: true })] },
    ]);

    expect(assembled[0]?.verdict).not.toBe('ready');
    expect(assembled[0]?.findings.join(' ')).toContain('continua em outra página');
  });

  it('links a recipe to the index entry that announced it', () => {
    const assembled = assembleRecipes(
      [{ pageIndex: 65, recipes: [recipe({ title: 'Gaspacho de tomate' })] }],
      { index: [{ title: 'Gaspacho de tomate', folio: 53 }] },
    );

    expect(assembled[0]?.indexedTitle).toBe('Gaspacho de tomate');
  });
});

describe('scoreRecipe', () => {
  it('caps the score at what the structure supports, however sure the model is', () => {
    const scored = scoreRecipe(
      recipe({
        title: 'Gaspacho',
        steps: [],
        reportedConfidence: { overall: 0.99, title: 0.99, ingredients: 0.99, steps: 0.99 },
      }),
    );

    expect(scored.confidence.steps).toBe(0);
    expect(scored.verdict).toBe('problem');
    expect(scored.findings).toContain('Nenhum passo de preparo foi lido.');
  });

  it('reports how many ingredients came without a quantity', () => {
    const scored = scoreRecipe(
      recipe({
        title: 'Gaspacho',
        ingredients: [
          { quantity: 1, unit: 'kg', ingredient: 'tomates', preparation: null, optional: false },
          { quantity: null, unit: null, ingredient: 'sel', preparation: null, optional: false },
        ],
      }),
    );

    expect(scored.findings).toContain('1 de 2 ingredientes sem quantidade.');
  });

  it('calls a complete reading ready', () => {
    const scored = scoreRecipe(
      recipe({
        title: 'Gaspacho de tomate',
        steps: [
          { order: 1, instruction: 'Pelez les tomates et coupez-les grossièrement.' },
          { order: 2, instruction: 'Mixez le tout avec l’huile et le vinaigre.' },
          { order: 3, instruction: 'Réservez au frais deux heures avant de servir.' },
          { order: 4, instruction: 'Servez avec un filet d’huile d’olive.' },
        ],
        ingredients: [
          { quantity: 1, unit: 'kg', ingredient: 'tomates', preparation: null, optional: false },
          {
            quantity: 5,
            unit: 'cl',
            ingredient: 'huile d’olive',
            preparation: null,
            optional: false,
          },
        ],
      }),
    );

    expect(scored.verdict).toBe('ready');
  });
});
