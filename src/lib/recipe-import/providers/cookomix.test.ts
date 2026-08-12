import { describe, expect, it } from 'vitest';

import { readFixture } from '@/test/fixtures';

import { runImport } from '../registry';

const HTML = readFixture('cookomix', 'gratin-dauphinois.html');
const URL_ = 'https://www.cookomix.com/recettes/gratin-dauphinois-thermomix/';

const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');

async function importFixture() {
  return runImport({
    url: URL_,
    html: HTML,
    parseHtml,
    importedAt: '2026-08-11T00:00:00.000Z',
  });
}

describe('cookomix importer', () => {
  it('detects the provider from the URL alone', async () => {
    const { provider } = await importFixture();
    expect(provider).toBe('cookomix');
  });

  it('reads the recipe head, preferring the page over the JSON-LD for times', async () => {
    const { recipe } = await importFixture();

    expect(recipe.title).toBe('Gratin Dauphinois au thermomix');
    expect(recipe.servings).toBe(6);
    expect(recipe.difficulty).toBe('facil');
    // The page says "Durée totale 55 min". The JSON-LD's prepTime + cookTime
    // would give 65: Cookomix puts the total in `cookTime`.
    expect(recipe.totalTimeSeconds).toBe(3300);
    expect(recipe.prepTimeSeconds).toBe(600);
    expect(recipe.language).toBe('fr-FR');
    expect(recipe.country).toBe('FR');
  });

  it('takes the external id from the embedded JS state', async () => {
    const { recipe } = await importFixture();
    expect(recipe.source.externalId).toBe('205');
    expect(recipe.source.url).toBe(URL_);
    expect(recipe.source.importedAt).toBe('2026-08-11T00:00:00.000Z');
  });

  it('keeps the image as a URL and never downloads it', async () => {
    const { recipe } = await importFixture();
    expect(recipe.source.imageUrl).toMatch(/^https:\/\/www\.cookomix\.com\/wp-content\/uploads\//);
  });

  it('reads the full macros off the page, not just the calories', async () => {
    const { recipe } = await importFixture();
    // The JSON-LD carries `calories` alone; the sidebar carries all five.
    expect(recipe.nutrition).toEqual({
      kcal: 431,
      proteinG: 5.9,
      carbsG: 37.6,
      fatG: 27.8,
      fiberG: 4,
    });
  });

  it('reads the ingredient table, keeping every source string', async () => {
    const { recipe } = await importFixture();
    expect(recipe.ingredients).toHaveLength(6);

    expect(recipe.ingredients[0]).toMatchObject({
      sourceName: 'Crème fraîche épaisse',
      sourceQuantity: '500',
      sourceUnit: 'grammes',
      quantity: 500,
      unit: 'g',
      unitKind: 'mass',
      normalizedName: null,
    });
    expect(recipe.ingredients[3]).toMatchObject({ unit: 'tsp', unitKind: 'spoon', quantity: 0.5 });
    expect(recipe.ingredients[4]).toMatchObject({ unitKind: 'pinch', isScalable: false });
  });

  it('builds one cooking path carrying every appliance the recipe uses', async () => {
    const { recipe } = await importFixture();
    expect(recipe.paths).toHaveLength(1);

    const path = recipe.paths[0]!;
    expect(path.name).toBe('Thermomix');
    expect(path.requiredEquipment).toEqual(['thermomix', 'oven']);
    expect(path.totalMinutes).toBe(55);
    expect(path.steps).toHaveLength(12);
  });

  it('extracts the Thermomix program and leaves the other steps alone', async () => {
    const { recipe, summary } = await importFixture();
    const steps = recipe.paths[0]!.steps;

    const program = steps.find((step) => step.instruction.startsWith('Cuire 20 min'));
    expect(program).toMatchObject({
      equipment: 'thermomix',
      durationSeconds: 1200,
      thermomix: { durationSeconds: 1200, temperatureC: 100, speed: 'spoon' },
    });

    // "Ajouter 1 gousse d'ail dans le bol" is a Thermomix step with no dials.
    const add = steps.find((step) => step.instruction.includes("gousse d'ail"));
    expect(add).toMatchObject({ equipment: 'thermomix', thermomix: null });

    // Every programmed step was parsed — that is the number worth reporting.
    expect(summary.stepsWithParameters).toBe(summary.programSteps);
  });

  it('routes the oven steps to the oven', async () => {
    const { recipe } = await importFixture();
    const oven = recipe.paths[0]!.steps.filter((step) => step.equipment === 'oven');
    expect(oven).toHaveLength(2);
    expect(oven[0]).toMatchObject({ temperatureC: 210 });
    expect(oven[1]).toMatchObject({ temperatureC: 210, durationSeconds: 1500 });
  });

  it('collects the theme chips as tags', async () => {
    const { recipe } = await importFixture();
    expect(recipe.tags).toEqual(
      expect.arrayContaining(['Gratins', 'Sans gluten', 'Accompagnement', 'Française']),
    );
  });

  it('validates clean and produces a stable slug', async () => {
    const first = await importFixture();
    const second = await importFixture();

    expect(first.validation.ok).toBe(true);
    expect(first.validation.errors).toEqual([]);
    // Deterministic: re-importing the same page must not mint a new slug.
    expect(first.recipe.slug).toBe(second.recipe.slug);
    expect(first.recipe.fingerprint).toBe(second.recipe.fingerprint);
  });
});
