import { describe, expect, it } from 'vitest';

import { runImport } from '../registry';
import { socialExternalId, socialLabel, socialNetworkOf } from './social';

/**
 * What `import-recipe` returns after reading a caption: a schema.org Recipe,
 * shaped exactly as `toSchemaOrg` builds it. Kept verbatim here so a change to
 * that function's output shape breaks this test rather than production.
 */
const CAPTION_RECIPE = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Frango cremoso na air fryer',
  description: 'Receita rápida de segunda-feira.',
  inLanguage: 'pt-BR',
  totalTime: 'PT35M',
  recipeYield: '4',
  recipeIngredient: [
    '500 g de peito de frango em cubos',
    '1 cebola picada',
    '200 ml de creme de leite',
    'sal e pimenta a gosto',
  ],
  recipeInstructions: [
    { '@type': 'HowToStep', name: 'Temperar', text: 'Tempere 500 g de frango com sal e pimenta.' },
    {
      '@type': 'HowToStep',
      name: 'Assar',
      text: 'Leve à air fryer a 180 °C por 15 minutos, mexendo na metade do tempo.',
    },
    { '@type': 'HowToStep', name: 'Misturar', text: 'Junte 200 ml de creme de leite e sirva.' },
  ],
  image: 'https://scontent.example/photo.jpg',
  url: 'https://www.instagram.com/p/C8xY_1aB2/',
};

const IMPORTED_AT = '2026-08-12T10:00:00.000Z';

describe('socialNetworkOf', () => {
  it('recognises the post URLs people actually paste', () => {
    expect(socialNetworkOf('https://www.instagram.com/p/C8xY_1aB2/')).toBe('instagram');
    expect(socialNetworkOf('https://instagram.com/reel/C8xY_1aB2/?igsh=abc')).toBe('instagram');
    expect(socialNetworkOf('https://www.facebook.com/share/p/aB9xK2/')).toBe('facebook');
    expect(socialNetworkOf('https://fb.watch/x1Y2z3/')).toBe('facebook');
  });

  it('matches on the domain, not on a substring of it', () => {
    // The classic allowlist leak: `endsWith('instagram.com')` says yes to both.
    expect(socialNetworkOf('https://evil-instagram.com/p/abc/')).toBeNull();
    expect(socialNetworkOf('https://instagram.com.attacker.example/p/abc/')).toBeNull();
    expect(socialNetworkOf('https://www.cookomix.com/recettes/x/')).toBeNull();
    expect(socialNetworkOf('nem sequer é uma URL')).toBeNull();
  });

  it('names the network for the review screen', () => {
    expect(socialLabel('https://www.instagram.com/p/C8xY_1aB2/')).toBe('Instagram');
    expect(socialLabel('https://www.facebook.com/share/p/aB9xK2/')).toBe('Facebook');
    expect(socialLabel('https://www.cookomix.com/recettes/x/')).toBeNull();
  });
});

describe('socialExternalId', () => {
  it('keeps the network inside the id, so two networks cannot collide', () => {
    expect(socialExternalId('https://www.instagram.com/p/C8xY_1aB2/')).toBe('instagram:C8xY_1aB2');
    expect(socialExternalId('https://www.instagram.com/reel/C8xY_1aB2/')).toBe(
      'instagram:C8xY_1aB2',
    );
    expect(socialExternalId('https://www.facebook.com/share/p/aB9xK2/')).toBe('facebook:aB9xK2');
  });

  it('returns null for a page that is not a post', () => {
    expect(socialExternalId('https://www.instagram.com/algum_perfil/')).toBeNull();
  });
});

describe('social import', () => {
  it('turns a read caption into a canonical recipe', async () => {
    const outcome = await runImport({
      provider: 'social',
      url: 'https://www.instagram.com/p/C8xY_1aB2/',
      structuredData: CAPTION_RECIPE,
      importedAt: IMPORTED_AT,
    });

    expect(outcome.validation.ok).toBe(true);
    expect(outcome.recipe.title).toBe('Frango cremoso na air fryer');
    expect(outcome.recipe.servings).toBe(4);
    expect(outcome.recipe.totalTimeSeconds).toBe(35 * 60);
    expect(outcome.recipe.ingredients).toHaveLength(4);
    expect(outcome.recipe.paths[0]?.steps).toHaveLength(3);

    // The source language is kept: translation is a separate, explicit pass.
    expect(outcome.recipe.language).toBe('pt-BR');

    expect(outcome.recipe.source.provider).toBe('social');
    expect(outcome.recipe.source.externalId).toBe('instagram:C8xY_1aB2');
    expect(outcome.recipe.source.url).toBe('https://www.instagram.com/p/C8xY_1aB2/');
  });

  it('reads the appliance and the numbers out of the caption prose', async () => {
    const outcome = await runImport({
      provider: 'social',
      url: 'https://www.instagram.com/p/C8xY_1aB2/',
      structuredData: CAPTION_RECIPE,
      importedAt: IMPORTED_AT,
    });

    const step = outcome.recipe.paths[0]?.steps[1];
    expect(step?.equipment).toBe('air_fryer');
    expect(step?.temperatureC).toBe(180);
    expect(step?.durationSeconds).toBe(15 * 60);
  });

  it('says on the recipe that a machine read the caption', async () => {
    const outcome = await runImport({
      provider: 'social',
      url: 'https://www.instagram.com/p/C8xY_1aB2/',
      structuredData: CAPTION_RECIPE,
      importedAt: IMPORTED_AT,
    });

    const note = outcome.recipe.notes.find((entry) => entry.kind === 'origem');
    expect(note?.body).toContain('Instagram');
  });

  it('fails validation rather than inventing when the reading found nothing', async () => {
    const outcome = await runImport({
      provider: 'social',
      url: 'https://www.instagram.com/p/C8xY_1aB2/',
      structuredData: { note: 'not a recipe at all' },
      importedAt: IMPORTED_AT,
    });

    expect(outcome.validation.ok).toBe(false);
    expect(outcome.validation.errors.map((issue) => issue.code)).toContain('no_ingredients');
  });
});
