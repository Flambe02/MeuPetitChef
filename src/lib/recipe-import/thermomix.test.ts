import { describe, expect, it } from 'vitest';

import { normalizeStep, stepDials } from './step-normalizer';
import { looksLikeProgram, parseThermomix, thermomixDials } from './thermomix';

describe('parseThermomix', () => {
  it('reads the canonical Cookomix program', () => {
    expect(parseThermomix('Cuire 20 min/100°C/Vitesse Cuillère.')).toMatchObject({
      durationSeconds: 1200,
      temperatureC: 100,
      speed: 'spoon',
      reverse: false,
    });
  });

  it('reads a two-unit duration', () => {
    expect(parseThermomix('Rissoler 3 min 30 sec/120°C/vitesse 1.')).toMatchObject({
      durationSeconds: 210,
      temperatureC: 120,
      speed: 1,
    });
  });

  it('reads a program with no temperature', () => {
    expect(parseThermomix('Mélanger 10 sec/vitesse 4.')).toMatchObject({
      durationSeconds: 10,
      temperatureC: null,
      speed: 4,
    });
  });

  it('reads the kneading mode', () => {
    expect(parseThermomix('Mélanger 2 min/vitesse pétrin.')).toMatchObject({
      durationSeconds: 120,
      speed: 'knead',
    });
    expect(parseThermomix('Junte o polvilho e misture 3 min/modo espiga.')).toMatchObject({
      speed: 'knead',
    });
  });

  it('reads Varoma as a temperature when it is a slot in the program', () => {
    expect(parseThermomix('Cuire 15 min/Varoma/Vitesse Cuillère.')).toMatchObject({
      durationSeconds: 900,
      temperatureC: 'varoma',
      speed: 'spoon',
      varomaAccessory: false,
    });
  });

  it('reads Varoma as the dish when the sentence is about the dish', () => {
    expect(parseThermomix('Ajouter le Varoma.')).toMatchObject({
      temperatureC: null,
      varomaAccessory: true,
    });
    expect(
      parseThermomix('Mettre le couscous trempé dans le Varoma et le remuer avec la spatule.'),
    ).toMatchObject({ temperatureC: null, varomaAccessory: true });
  });

  it('reads reverse and turbo', () => {
    expect(parseThermomix('Cuire 10 min/100°C/sens inverse/vitesse mijotage')).toMatchObject({
      durationSeconds: 600,
      temperatureC: 100,
      reverse: true,
      speed: 'spoon',
    });
    expect(parseThermomix('20 sec/vitesse 5/Turbo')).toMatchObject({ turbo: true, speed: 5 });
    expect(
      parseThermomix('Cozinhe 15 min/Varoma/sentido inverso/vel. colher, sem o copo medidor.'),
    ).toMatchObject({ reverse: true, temperatureC: 'varoma', speed: 'spoon' });
  });

  it('reads the German and English locales', () => {
    expect(parseThermomix('5 Min./100°C/Stufe 1')).toMatchObject({
      durationSeconds: 300,
      temperatureC: 100,
      speed: 1,
    });
    expect(parseThermomix('20 min/100°C/speed 1')).toMatchObject({ speed: 1 });
    expect(parseThermomix('5 seg/vel. 5')).toMatchObject({ durationSeconds: 5, speed: 5 });
  });

  it('does not mistake a measuring spoon for the spoon speed', () => {
    // The regression that put a velocity dial on every "add salt" step: in
    // French the measuring spoon and the machine setting are the same word.
    expect(
      parseThermomix('Ajouter ½ cuillère à café de sel (à ajuster) dans le bol du Thermomix.'),
    ).toBeNull();
  });

  it('returns null for a Thermomix step that programs nothing', () => {
    expect(parseThermomix('Racler les parois du bol avec la spatule')).toBeNull();
    expect(parseThermomix('')).toBeNull();
  });
});

describe('looksLikeProgram', () => {
  it('separates a program from an action', () => {
    expect(looksLikeProgram('Cuire 20 min/100°C/Vitesse Cuillère.')).toBe(true);
    expect(looksLikeProgram("Ajouter 1 gousse d'ail dans le bol du Thermomix.")).toBe(false);
  });
});

describe('thermomixDials', () => {
  it('produces one dial per kind, split into number and label', () => {
    const settings = parseThermomix('Cuire 15 min/Varoma/sens inverse/Vitesse Cuillère.');
    expect(settings).not.toBeNull();
    const dials = thermomixDials(settings!);

    expect(dials.map((dial) => dial.kind)).toEqual(['tempo', 'temperatura', 'velocidade', 'modo']);
    expect(dials[0]).toMatchObject({ valueNum: 900, valueText: '15 min' });
    // Varoma has no number: the dial prints a word and drives no comparison.
    expect(dials[1]).toMatchObject({ valueNum: null, valueText: 'Varoma' });
    expect(dials[2]).toMatchObject({ valueNum: null, valueText: 'Colher' });
    expect(dials[3]).toMatchObject({ valueText: 'Inverso' });
  });

  it('keeps the source wording when the union flattened it', () => {
    const settings = parseThermomix('Cuire 10 min/100°C/vitesse mijotage');
    expect(thermomixDials(settings!)[2]).toMatchObject({
      valueText: 'Colher',
      subLabel: 'vitesse mijotage',
    });
  });
});

describe('normalizeStep', () => {
  it('takes the appliance from the source label when there is one', () => {
    expect(
      normalizeStep({ text: 'Préchauffer le four à 210°C.', label: 'Préchauffage du four' }, 0),
    ).toMatchObject({ equipment: 'oven', temperatureC: 210 });

    expect(
      normalizeStep(
        { text: 'Cuire 20 min/100°C/Vitesse Cuillère.', label: 'Programmation du Thermomix' },
        0,
      ),
    ).toMatchObject({ equipment: 'thermomix', durationSeconds: 1200 });
  });

  it('falls back to appliance words in the sentence', () => {
    expect(normalizeStep({ text: 'Mettre dans le four pendant 25 min à 210°C.' }, 0)).toMatchObject(
      {
        equipment: 'oven',
        durationSeconds: 1500,
        temperatureC: 210,
      },
    );
    expect(normalizeStep({ text: 'Servir immédiatement.' }, 0)).toMatchObject({
      equipment: 'none',
    });
  });

  it('gives a non-Thermomix step its time and temperature dials', () => {
    const step = normalizeStep({ text: 'Mettre dans le four pendant 25 min à 210°C.' }, 0);
    expect(stepDials(step).map((dial) => dial.kind)).toEqual(['tempo', 'temperatura']);
  });
});
