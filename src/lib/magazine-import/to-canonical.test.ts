import { describe, expect, it } from 'vitest';

import { validateRecipe } from '@/lib/recipe-import/validate';

import { magazineExternalId, provenanceLabel, toCanonicalRecipe } from './to-canonical';
import type { MagazineProvenance } from './to-canonical';
import type { MagazineRecipe } from './types';

const SOURCE: MagazineProvenance = {
  importId: 'import-1',
  publication: 'Régal',
  issue: 'Hors-Série N31',
  publicationDate: '2026-06',
  language: 'fr',
  folios: [61],
};

const RECIPE: MagazineRecipe = {
  title: 'Gambas panées et sauce au citron vert',
  description: 'Croustillantes dehors, fondantes dedans.',
  servings: 4,
  prepMinutes: 20,
  cookMinutes: 15,
  restMinutes: null,
  ingredients: [
    {
      quantity: 12,
      unit: null,
      ingredient: 'gambas',
      preparation: 'décortiquées',
      optional: false,
    },
    { quantity: 100, unit: 'g', ingredient: 'chapelure', preparation: null, optional: false },
    { quantity: 1, unit: null, ingredient: 'citron vert', preparation: null, optional: false },
    { quantity: null, unit: null, ingredient: 'sel', preparation: null, optional: true },
  ],
  steps: [
    { order: 1, instruction: 'Panez les gambas dans la chapelure.' },
    {
      order: 2,
      instruction:
        'Faites cuire à l’air fryer à 190 °C pendant 12 minutes en secouant à mi-cuisson.',
    },
    { order: 3, instruction: 'Servez avec la sauce au citron vert.' },
  ],
  tips: ['Doublez la sauce, elle part vite.'],
  notes: [],
  language: 'fr',
  continuationBefore: false,
  continuationAfter: false,
  reportedConfidence: { overall: 0.96, title: 0.99, ingredients: 0.96, steps: 0.95 },
};

/**
 * The point of these tests is not that the conversion "works" — it is that the
 * magazine recipe lands in the *existing* pipeline and inherits everything
 * already written there. If a magazine ever needed its own quantity parser or
 * its own appliance detection, this file would be the wrong design.
 */
describe('toCanonicalRecipe', () => {
  const canonical = toCanonicalRecipe(RECIPE, SOURCE, { importedAt: '2026-08-12T10:00:00.000Z' });

  it('passes the same validation every other import passes', () => {
    expect(validateRecipe(canonical).ok).toBe(true);
  });

  it('inherits the shared quantity and unit parsing', () => {
    const chapelure = canonical.ingredients.find((line) => line.sourceName.includes('chapelure'));
    expect(chapelure?.quantity).toBe(100);
    expect(chapelure?.unit).toBe('g');
  });

  it('turns the preparation into a note rather than into the name', () => {
    const gambas = canonical.ingredients.find((line) => line.sourceName.startsWith('gambas'));
    expect(gambas?.sourceName).toBe('gambas');
    expect(gambas?.note).toBe('décortiquées');
  });

  it('inherits appliance detection and the dials that come with it', () => {
    const step = canonical.paths[0]?.steps[1];
    expect(step?.equipment).toBe('air_fryer');
    expect(step?.temperatureC).toBe(190);
    expect(step?.durationSeconds).toBe(720);
  });

  it('does not translate — the recipe stays in the magazine’s language', () => {
    // A mechanical "gambas" → "camarão" here would be a product decision
    // disguised as a conversion, and unbaking it later is impossible. The
    // Brazilian pass is separate and explicit.
    expect(canonical.title).toBe('Gambas panées et sauce au citron vert');
    expect(canonical.ingredients.every((line) => line.normalizedName === null)).toBe(true);
    expect(canonical.language).toBe('fr');
  });

  it('carries the provenance as a note, since there is no URL to carry it', () => {
    const source = canonical.notes.find((note) => note.title === 'Fonte');
    expect(source?.body).toBe('Régal · Hors-Série N31 · 2026-06 · p. 61');
  });

  it('marks the recipe as a magazine import, which is what stops it being published', () => {
    // Migration 14: `source_provider is null or status <> 'published'`. The
    // constraint is in the database, so this is not a convention that can be
    // forgotten by a back-office screen.
    expect(canonical.source.provider).toBe('magazine');
    expect(canonical.source.imageUrl).toBeNull();
  });

  it('adds up the printed times', () => {
    expect(canonical.totalTimeSeconds).toBe((20 + 15) * 60);
  });

  it('is deterministic: the same page re-imported keeps the same slug', () => {
    const again = toCanonicalRecipe(RECIPE, SOURCE, { importedAt: '2026-09-01T00:00:00.000Z' });
    expect(again.slug).toBe(canonical.slug);
    expect(again.fingerprint).toBe(canonical.fingerprint);
  });
});

describe('provenance', () => {
  it('degrades to something usable when the cover was unreadable', () => {
    expect(
      provenanceLabel({
        importId: 'import-1',
        publication: null,
        issue: null,
        publicationDate: null,
        language: 'fr',
        folios: [],
      }),
    ).toBe('Revista importada');
  });

  it('builds an external id from the issue and the page', () => {
    expect(magazineExternalId(SOURCE, 'Gambas')).toBe('regal-hors-serie-n31:p61');
  });
});
