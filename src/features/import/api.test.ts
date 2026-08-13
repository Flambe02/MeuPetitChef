import { describe, expect, it } from 'vitest';

import { analyzeImport } from './api';

const AI_GENERATED_JSON = JSON.stringify({
  '@type': 'Recipe',
  name: 'Receita colada como JSON',
  recipeYield: '2',
  recipeIngredient: ['200 g de arroz', '1 cebola'],
  recipeInstructions: ['Refogue a cebola.', 'Junte o arroz e cozinhe.'],
});

describe('analyzeImport — pasted/uploaded JSON with no matching site', () => {
  it('falls back to the file provider instead of refusing the source', async () => {
    const outcome = await analyzeImport({ url: '', source: AI_GENERATED_JSON });

    expect(outcome.provider).toBe('file');
    expect(outcome.recipe.title).toBe('Receita colada como JSON');
    expect(outcome.recipe.ingredients).toHaveLength(2);
  });

  it('still prefers a detected site provider when the URL matches one', async () => {
    // Cookomix JSON, pasted alongside its own URL — the site-specific parser
    // (DOM enrichment for macros/difficulty) must still win over the generic
    // file reader.
    const outcome = await analyzeImport({
      url: 'https://www.cookomix.com/recettes/x/',
      source: AI_GENERATED_JSON,
    });

    expect(outcome.provider).toBe('cookomix');
  });

  it('an explicit provider still wins over both', async () => {
    const outcome = await analyzeImport({
      url: '',
      source: AI_GENERATED_JSON,
      provider: 'file',
    });

    expect(outcome.provider).toBe('file');
  });
});
