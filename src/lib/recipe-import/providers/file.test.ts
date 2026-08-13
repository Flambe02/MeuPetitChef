import { describe, expect, it } from 'vitest';

import { runImport } from '../registry';

/**
 * What the AI_PROMPT in ImportScreen.tsx asks an outside model to produce —
 * schema.org/Recipe JSON, kept verbatim here so a prompt change that breaks
 * the shape breaks this test rather than a real import.
 */
const AI_GENERATED_RECIPE = {
  '@type': 'Recipe',
  name: 'Crevettes com Abobrinha, Cenoura e Batata Doce',
  description: 'Receita rápida do dia a dia.',
  recipeYield: '4',
  prepTime: 'PT15M',
  cookTime: 'PT20M',
  totalTime: 'PT35M',
  recipeCategory: 'Prato principal',
  recipeCuisine: 'Francesa',
  keywords: 'camarão, legumes',
  recipeIngredient: [
    '300 g de camarões, limpos e descascados',
    '1 abobrinha, cortada em cubos',
    '1 cenoura, cortada em tiras finas',
    '200 g de batata doce, cortada em cubos',
  ],
  recipeInstructions: [
    'Descasque os camarões, a abobrinha, a cenoura e a batata doce.',
    'Misture tudo numa tigela com azeite, sal e pimenta.',
  ],
  nutrition: {
    calories: '320 kcal',
    proteinContent: '28',
    carbohydrateContent: '30',
    fatContent: '10',
    fiberContent: '5',
  },
  inLanguage: 'pt-BR',
};

const IMPORTED_AT = '2026-08-17T10:00:00.000Z';

describe('file import', () => {
  it('parses schema.org/Recipe JSON with no URL at all', async () => {
    const outcome = await runImport({
      provider: 'file',
      url: null,
      structuredData: AI_GENERATED_RECIPE,
      importedAt: IMPORTED_AT,
    });

    expect(outcome.validation.ok).toBe(true);
    expect(outcome.recipe.title).toBe('Crevettes com Abobrinha, Cenoura e Batata Doce');
    expect(outcome.recipe.servings).toBe(4);
    expect(outcome.recipe.totalTimeSeconds).toBe(35 * 60);
    expect(outcome.recipe.ingredients).toHaveLength(4);
    expect(outcome.recipe.paths[0]?.steps).toHaveLength(2);
    expect(outcome.recipe.nutrition.kcal).toBe(320);
    expect(outcome.recipe.source.provider).toBe('file');
    expect(outcome.recipe.source.url).toBeNull();
  });

  it('unwraps a { recipe: {...} } envelope, in case the model wraps its answer', async () => {
    const outcome = await runImport({
      provider: 'file',
      url: null,
      structuredData: { recipe: AI_GENERATED_RECIPE },
      importedAt: IMPORTED_AT,
    });

    expect(outcome.recipe.title).toBe('Crevettes com Abobrinha, Cenoura e Batata Doce');
  });

  it('says on the recipe that a file was read, not a page fetched', async () => {
    const outcome = await runImport({
      provider: 'file',
      url: null,
      structuredData: AI_GENERATED_RECIPE,
      importedAt: IMPORTED_AT,
    });

    const note = outcome.recipe.notes.find((entry) => entry.kind === 'origem');
    expect(note?.body).toContain('arquivo');
  });

  it('fails validation rather than inventing when the file has no recipe in it', async () => {
    const outcome = await runImport({
      provider: 'file',
      url: null,
      structuredData: { hello: 'not a recipe' },
      importedAt: IMPORTED_AT,
    });

    expect(outcome.validation.ok).toBe(false);
    expect(outcome.validation.errors.map((issue) => issue.code)).toContain('no_ingredients');
  });

  it('never auto-detects from a URL — it is always forced explicitly', async () => {
    await expect(runImport({ url: 'https://example.com/anything' })).rejects.toThrow();
  });
});
