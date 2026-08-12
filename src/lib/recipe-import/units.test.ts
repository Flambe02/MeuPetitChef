import { describe, expect, it } from 'vitest';

import { normalizeIngredient } from './ingredient-normalizer';
import { parseNumber } from './text';
import { parseAmount, parseEnergyKcal } from './units';

describe('parseNumber', () => {
  it('reads the numbers cookbooks write', () => {
    expect(parseNumber('500')).toBe(500);
    expect(parseNumber('0,5')).toBe(0.5);
    expect(parseNumber('½')).toBe(0.5);
    expect(parseNumber('1 ½')).toBe(1.5);
    expect(parseNumber('1 1/2')).toBe(1.5);
    expect(parseNumber('1 200')).toBe(1200);
  });

  it('takes the low end of a range', () => {
    expect(parseNumber('2-3')).toBe(2);
  });
});

describe('parseAmount', () => {
  it('normalizes mass and volume', () => {
    expect(parseAmount('500 grammes')).toMatchObject({
      quantity: 500,
      unit: 'g',
      unitKind: 'mass',
    });
    expect(parseAmount('1,5 kg')).toMatchObject({ quantity: 1.5, unit: 'kg', unitKind: 'mass' });
    expect(parseAmount('250 ml')).toMatchObject({ quantity: 250, unit: 'ml', unitKind: 'volume' });
    expect(parseAmount('2 litres')).toMatchObject({ quantity: 2, unit: 'l', unitKind: 'volume' });
    // Centilitres are converted, since `cl` is not a unit our UI prints.
    expect(parseAmount('10 cl')).toMatchObject({ quantity: 100, unit: 'ml' });
  });

  it('maps spoons across languages and keeps them scaling as spoons', () => {
    expect(parseAmount('0.5 cuillère à café')).toMatchObject({ unit: 'tsp', unitKind: 'spoon' });
    expect(parseAmount('2 cuillères à soupe')).toMatchObject({ unit: 'tbsp', unitKind: 'spoon' });
    expect(parseAmount('1 colher de sopa')).toMatchObject({ unit: 'tbsp', unitKind: 'spoon' });
    expect(parseAmount('1 ½ TL')).toMatchObject({ quantity: 1.5, unit: 'tsp', unitKind: 'spoon' });
  });

  it('marks pinches so they never scale', () => {
    expect(parseAmount('2 pincées')).toMatchObject({ unit: 'pitada', unitKind: 'pinch' });
    expect(parseAmount('1 Prise')).toMatchObject({ unit: 'pitada', unitKind: 'pinch' });
  });

  it('keeps an unknown unit verbatim instead of dropping it', () => {
    expect(parseAmount('1 Würfel')).toMatchObject({
      quantity: 1,
      unit: 'Würfel',
      unitKind: 'count',
      isUnitVerbatim: true,
    });
  });

  it('always keeps the source, whatever it did with it', () => {
    expect(parseAmount('500 grammes')).toMatchObject({
      sourceQuantity: '500',
      sourceUnit: 'grammes',
    });
  });

  it('recognises "a gosto" as a non-quantity', () => {
    expect(parseAmount('a gosto')).toMatchObject({ quantity: null, unitKind: 'to_taste' });
  });
});

describe('parseEnergyKcal', () => {
  it('prefers kcal when both units are printed', () => {
    // Cookidoo writes both; reading the first number makes a recipe 4× richer.
    expect(parseEnergyKcal('788.3 kJ / 188.4 kcal')).toBe(188.4);
    expect(parseEnergyKcal('431 kcal')).toBe(431);
  });

  it('converts kilojoules when they are alone', () => {
    expect(parseEnergyKcal('1000 kJ')).toBe(239);
  });
});

describe('normalizeIngredient', () => {
  it('splits the name-first form Cookomix publishes', () => {
    expect(normalizeIngredient({ text: 'Crème fraîche épaisse - 500 grammes' }, 0)).toMatchObject({
      sourceName: 'Crème fraîche épaisse',
      quantity: 500,
      unit: 'g',
      normalizedName: null,
    });
  });

  it('splits the amount-first form, unit words included', () => {
    expect(normalizeIngredient({ text: "2 cuillères à soupe d'huile d'olive" }, 0)).toMatchObject({
      sourceName: "huile d'olive",
      quantity: 2,
      unit: 'tbsp',
    });
    expect(normalizeIngredient({ text: '100 g Weizenkörner' }, 0)).toMatchObject({
      sourceName: 'Weizenkörner',
      quantity: 100,
      unit: 'g',
    });
  });

  it('keeps a count with no unit word', () => {
    expect(normalizeIngredient({ text: '1 courgette coupée en morceaux' }, 0)).toMatchObject({
      sourceName: 'courgette coupée en morceaux',
      quantity: 1,
      unit: null,
      unitKind: 'count',
    });
  });

  it('does not split on a hyphen that is part of a name', () => {
    expect(normalizeIngredient({ text: 'Pommes-de-terre nouvelles' }, 0)).toMatchObject({
      sourceName: 'Pommes-de-terre nouvelles',
      quantity: null,
    });
  });

  it('moves a parenthetical into the note', () => {
    expect(
      normalizeIngredient(
        { text: 'Sel (à ajuster en fonction des goûts) - 0.5 cuillère à café' },
        0,
      ),
    ).toMatchObject({ sourceName: 'Sel', note: 'à ajuster en fonction des goûts' });
  });

  it('never translates — that is the adaptation pass, not the import', () => {
    const line = normalizeIngredient({ text: 'Crème fraîche épaisse - 500 grammes' }, 0);
    expect(line.normalizedName).toBeNull();
    expect(line.sourceName).toBe('Crème fraîche épaisse');
  });

  it('flags optional lines and stops pinches from scaling', () => {
    expect(normalizeIngredient({ text: 'Persil (facultatif) - 1 branche' }, 0).isOptional).toBe(
      true,
    );
    expect(normalizeIngredient({ text: 'Poivre - 2 pincées' }, 0).isScalable).toBe(false);
  });
});
