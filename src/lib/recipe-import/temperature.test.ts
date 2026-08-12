import { describe, expect, it } from 'vitest';

import { findTemperature, formatTemperature, parseTemperature } from './temperature';

describe('parseTemperature', () => {
  it('reads the shapes recipes write', () => {
    expect(parseTemperature('120°')).toBe(120);
    expect(parseTemperature('120°C')).toBe(120);
    expect(parseTemperature('120 C')).toBe(120);
    expect(parseTemperature('210 °C')).toBe(210);
    expect(parseTemperature('37°C')).toBe(37);
  });

  it('keeps Varoma as a word, because the machine does', () => {
    expect(parseTemperature('Varoma')).toBe('varoma');
    expect(parseTemperature('varoma')).toBe('varoma');
    expect(formatTemperature('varoma')).toBe('Varoma');
  });

  it('converts Fahrenheit', () => {
    expect(parseTemperature('350 F')).toBe(177);
  });

  it('refuses values no domestic appliance reaches', () => {
    expect(parseTemperature('900°C')).toBeNull();
  });
});

describe('findTemperature', () => {
  it('only accepts a temperature the sentence announces', () => {
    expect(findTemperature('Préchauffer le four à 210°C.')).toBe(210);
    expect(findTemperature('Cuire 15 min/Varoma/Vitesse Cuillère.')).toBe('varoma');
  });

  it('does not read a duration as a temperature', () => {
    // The trap `parseTemperature` alone falls into: "20" in "Cuire 20 min".
    expect(findTemperature('Cuire 20 min à vitesse 1')).toBeNull();
    expect(findTemperature('Ajouter 2 pincées de poivre')).toBeNull();
  });
});
