import { describe, expect, it } from 'vitest';

import { formatAmount, formatQuantity, scaleQuantity, servingFactor } from './scaling';

describe('scaleQuantity', () => {
  it('leaves pinches and "a gosto" alone whatever the factor', () => {
    expect(scaleQuantity(1, 'pinch', 4)).toBe(1);
    expect(scaleQuantity(1, 'to_taste', 0.5)).toBe(1);
  });

  it('keeps countable ingredients whole and never below one', () => {
    expect(scaleQuantity(1, 'count', 2)).toBe(2);
    expect(scaleQuantity(1, 'count', 0.5)).toBe(1);
    expect(scaleQuantity(3, 'count', 0.5)).toBe(2);
  });

  it('rounds mass and volume to the nearest 5', () => {
    expect(scaleQuantity(500, 'mass', 0.5)).toBe(250);
    expect(scaleQuantity(120, 'mass', 1.25)).toBe(150);
    expect(scaleQuantity(33, 'volume', 1)).toBe(33);
    expect(scaleQuantity(33, 'volume', 1.1)).toBe(35);
  });

  it('never rounds a mass down to zero', () => {
    expect(scaleQuantity(4, 'mass', 0.25)).toBe(5);
  });

  it('rounds spoons to the nearest half', () => {
    expect(scaleQuantity(2, 'spoon', 1.25)).toBe(2.5);
    expect(scaleQuantity(1, 'spoon', 0.25)).toBe(0.5);
  });

  it('passes null through', () => {
    expect(scaleQuantity(null, 'mass', 2)).toBeNull();
  });

  it('is a no-op at factor 1, exactly', () => {
    expect(scaleQuantity(33, 'mass', 1)).toBe(33);
  });
});

describe('formatQuantity', () => {
  it('uses a comma decimal separator', () => {
    expect(formatQuantity(2.5)).toBe('2,5');
    expect(formatQuantity(250)).toBe('250');
    expect(formatQuantity(null)).toBe('');
  });
});

describe('formatAmount', () => {
  it('joins value and unit', () => {
    expect(formatAmount(500, 'ml')).toBe('500 ml');
    expect(formatAmount(2, 'c. sopa')).toBe('2 c. sopa');
    expect(formatAmount(null, 'a gosto')).toBe('a gosto');
  });
});

describe('servingFactor', () => {
  it('divides target by base', () => {
    expect(servingFactor(2, 4)).toBe(0.5);
    expect(servingFactor(6, 4)).toBe(1.5);
  });

  it('falls back to 1 when the base is unusable', () => {
    expect(servingFactor(4, 0)).toBe(1);
  });
});
