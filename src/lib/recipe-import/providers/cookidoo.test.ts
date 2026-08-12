import { describe, expect, it } from 'vitest';

import { readFixture } from '@/test/fixtures';

import { runImport } from '../registry';

const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const IMPORTED_AT = '2026-08-11T00:00:00.000Z';

describe('cookidoo importer — mode 1, a public URL', () => {
  const html = readFixture('cookidoo', 'public-recipe.html');
  const url = 'https://cookidoo.fr/recipes/recipe/fr-FR/r59322';

  const run = () => runImport({ url, html, parseHtml, importedAt: IMPORTED_AT });

  it('reads everything the public page does carry', async () => {
    const { recipe } = await run();
    expect(recipe.title).toBe('Vollwert-Brötchen/Baguettes');
    expect(recipe.servings).toBe(12);
    expect(recipe.difficulty).toBe('facil');
    expect(recipe.totalTimeSeconds).toBe(2400);
    expect(recipe.source.externalId).toBe('r59322');
  });

  it('reads the ingredients out of the custom elements, alternatives included', async () => {
    const { recipe } = await run();
    expect(recipe.ingredients).toHaveLength(7);
    expect(recipe.ingredients[0]).toMatchObject({
      sourceName: 'Weizenkörner',
      quantity: 100,
      unit: 'g',
      note: 'Alternativa: 100 g Dinkelkörner',
    });
    // "1 ½ TL Salz" — a vulgar fraction and a German spoon.
    expect(recipe.ingredients[2]).toMatchObject({ quantity: 1.5, unit: 'tsp', unitKind: 'spoon' });
    // An unmapped noun survives rather than being dropped.
    expect(recipe.ingredients[5]).toMatchObject({ unit: 'Würfel', unitKind: 'count' });
  });

  it('reads kcal and not kilojoules', async () => {
    const { recipe } = await run();
    // The page prints "788.3 kJ / 188.4 kcal" in one string.
    expect(recipe.nutrition.kcal).toBe(188.4);
    expect(recipe.nutrition.proteinG).toBe(5.6);
  });

  it('fails validation because the steps are behind the subscription', async () => {
    const { recipe, validation } = await run();

    // This is the documented limitation, asserted rather than described: the
    // public page contains no preparation steps, and the importer says so
    // instead of inventing them.
    expect(recipe.paths[0]!.steps).toHaveLength(0);
    expect(validation.ok).toBe(false);
    expect(validation.errors.map((error) => error.code)).toContain('no_steps');
    expect(recipe.paths[0]!.reason).toMatch(/pública/);
  });
});

describe('cookidoo importer — mode 2, an HTML page the user saved', () => {
  const html = readFixture('cookidoo', 'saved-recipe.html');

  const run = () =>
    runImport({ provider: 'cookidoo', url: null, html, parseHtml, importedAt: IMPORTED_AT });

  it('imports without a URL at all', async () => {
    const { recipe, validation } = await run();
    expect(recipe.title).toBe('Pão de queijo mineiro');
    expect(recipe.ingredients).toHaveLength(6);
    expect(recipe.ingredients[1]).toMatchObject({
      sourceName: 'queijo minas meia cura em cubos',
      quantity: 100,
      unit: 'g',
      note: 'Alternativa: 100 g de queijo canastra',
    });
    expect(validation.ok).toBe(true);
  });

  it('finds the preparation steps that a subscriber page carries', async () => {
    const { recipe, summary } = await run();
    const steps = recipe.paths[0]!.steps;

    expect(steps).toHaveLength(5);
    expect(summary.stepsWithParameters).toBe(4);
  });

  it('parses the Brazilian Thermomix vocabulary', async () => {
    const { recipe } = await run();
    const steps = recipe.paths[0]!.steps;

    expect(steps[0]!.thermomix).toMatchObject({ durationSeconds: 5, speed: 7 });
    expect(steps[1]!.thermomix).toMatchObject({ durationSeconds: 300, temperatureC: 90, speed: 2 });
    expect(steps[2]!.thermomix).toMatchObject({ speed: 'knead' });
    expect(steps[3]!.thermomix).toMatchObject({
      durationSeconds: 900,
      temperatureC: 'varoma',
      reverse: true,
      speed: 'spoon',
    });
    // The last step leaves the machine entirely.
    expect(steps[4]).toMatchObject({ equipment: 'oven', temperatureC: 200, durationSeconds: 1500 });
  });
});

describe('cookidoo importer — mode 3, a JSON payload', () => {
  const structuredData: unknown = JSON.parse(readFixture('cookidoo', 'recipe.json'));

  const run = () => runImport({ provider: 'cookidoo', structuredData, importedAt: IMPORTED_AT });

  it('imports a schema.org Recipe with no page at all', async () => {
    const { recipe, validation } = await run();

    expect(recipe.title).toBe('Sopa de abóbora com gengibre');
    expect(recipe.servings).toBe(4);
    expect(recipe.ingredients).toHaveLength(6);
    expect(recipe.paths[0]!.steps).toHaveLength(4);
    expect(validation.ok).toBe(true);
  });

  it('produces exactly the same internal format as the HTML modes', async () => {
    const { recipe, summary } = await run();

    expect(recipe.source.provider).toBe('cookidoo');
    expect(recipe.paths[0]!.requiredEquipment).toEqual(['thermomix']);
    expect(summary.stepsWithParameters).toBe(4);
    expect(recipe.paths[0]!.steps[2]!.thermomix).toMatchObject({
      durationSeconds: 1200,
      temperatureC: 100,
      speed: 'spoon',
    });
  });

  it('carries the source language and country through', async () => {
    const { recipe } = await run();
    expect(recipe.language).toBe('pt-BR');
    expect(recipe.country).toBe('BR');
  });
});
