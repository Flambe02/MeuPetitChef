import { describe, expect, it } from 'vitest';

import type { AdaptationRequest } from './adapt';
import {
  buildBrief,
  checkOriginality,
  extractFacts,
  verbatimOverlap,
  type TechniqueFact,
} from './reference';

const reference: AdaptationRequest = {
  recipeId: 'r1',
  sourceLanguage: 'fr-FR',
  title: 'Gratin Dauphinois au thermomix',
  subtitle: null,
  description: 'Le vrai gratin dauphinois, celui du Dauphiné, avec une longue histoire de famille.',
  servings: 6,
  ingredients: [
    { id: 'i1', displayName: 'Crème fraîche épaisse', quantity: 500, unit: 'g', note: null },
    { id: 'i2', displayName: 'Pommes de terre', quantity: 1200, unit: 'g', note: null },
    { id: 'i3', displayName: "Gousse d'ail", quantity: 1, unit: null, note: null },
  ],
  steps: [],
  notes: [],
};

const steps = [
  { equipment: 'thermomix' as const, instruction: 'Mettre 500 grammes de crème dans le bol.' },
  { equipment: 'thermomix' as const, instruction: 'Cuire 20 min/100°C/Vitesse Cuillère.' },
  { equipment: 'oven' as const, instruction: 'Mettre dans le four pendant 25 min à 210°C.' },
  { equipment: 'none' as const, instruction: 'Servir immédiatement.' },
];

describe('extractFacts', () => {
  it('keeps the ingredients and the numbers, drops the prose', () => {
    const facts = extractFacts(reference, steps, 'cookomix');

    expect(facts.dish).toBe('Gratin Dauphinois au thermomix');
    expect(facts.servings).toBe(6);
    expect(facts.ingredients).toHaveLength(3);

    // Only the two steps that carry parameters survive; "serve immediately"
    // is not a technique, it is a sentence anyone writes for themselves.
    expect(facts.techniques).toHaveLength(2);
    expect(facts.techniques[0]).toMatchObject({
      equipment: 'thermomix',
      durationSeconds: 1200,
      temperature: 100,
      speed: 'spoon',
    });
    expect(facts.techniques[1]).toMatchObject({
      equipment: 'oven',
      durationSeconds: 1500,
      temperature: 210,
    });
  });

  it('never carries a source sentence through', () => {
    const facts = extractFacts(reference, steps, 'cookomix');
    const serialised = JSON.stringify(facts);

    // This is the whole point of the module: the expression stays behind.
    expect(serialised).not.toContain('Mettre 500 grammes');
    expect(serialised).not.toContain('Servir immédiatement');
    expect(serialised).not.toContain('Le vrai gratin dauphinois');
  });
});

describe('buildBrief', () => {
  it('asks for a recipe written from scratch, with the source parameters as reference', () => {
    const brief = buildBrief(extractFacts(reference, steps), ['air_fryer', 'none']);

    expect(brief).toContain('Gratin Dauphinois');
    expect(brief).toContain('1200 g Pommes de terre');
    expect(brief).toContain('air_fryer');
    expect(brief).toMatch(/suas próprias palavras/);
    // Not one sentence of the source in the prompt.
    expect(brief).not.toContain('Mettre 500 grammes');
  });
});

describe('verbatimOverlap', () => {
  it('is zero for genuinely different writing', () => {
    expect(
      verbatimOverlap(
        ['Coloque 500 g de creme de leite no copo e cozinhe por vinte minutos.'],
        ['Descasque as batatas e corte em rodelas finas com a ajuda de um mandolim.'],
      ),
    ).toBe(0);
  });

  it('catches a paraphrase that is really a copy', () => {
    const source = ['Coloque as batatas em rodelas no copo do Thermomix e cozinhe com o creme.'];
    const copy = ['Coloque as batatas em rodelas no copo do Thermomix e cozinhe com o creme.'];
    expect(verbatimOverlap(source, copy)).toBe(1);
  });
});

describe('checkOriginality', () => {
  const referenceTechniques: TechniqueFact[] = [
    { equipment: 'thermomix', durationSeconds: 1200, temperature: 100, speed: 'spoon' },
    { equipment: 'oven', durationSeconds: 1500, temperature: 210, speed: null },
  ];

  it('accepts a recipe written in its own words', () => {
    const result = checkOriginality(
      { instructions: ['Cuire 20 min/100°C/Vitesse Cuillère.'], techniques: referenceTechniques },
      {
        instructions: ['Descasque 1200 g de batata e corte em rodelas de meio centímetro.'],
        techniques: [
          { equipment: 'air_fryer', durationSeconds: 1080, temperature: 180, speed: null },
        ],
      },
    );
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('refuses text lifted from the reference', () => {
    const sentence = 'Coloque as batatas em rodelas no copo e cozinhe com o creme de leite fresco.';
    const result = checkOriginality(
      { instructions: [sentence], techniques: [] },
      { instructions: [sentence], techniques: [] },
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('verbatim_overlap');
  });

  it('warns when the parameter sequence is reproduced exactly', () => {
    const result = checkOriginality(
      { instructions: ['a'], techniques: referenceTechniques },
      {
        instructions: ['Uma frase completamente diferente sobre batatas.'],
        techniques: referenceTechniques,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('identical_technique_sequence');
  });

  it('is blunter when the appliance changed but the numbers did not', () => {
    // An air fryer that runs 20 min at 100 °C because the Thermomix did is not
    // a converted recipe, it is a copied one that will not cook.
    const converted = referenceTechniques.map((fact) => ({
      ...fact,
      equipment: 'air_fryer' as const,
    }));
    const result = checkOriginality(
      { instructions: ['a'], techniques: referenceTechniques },
      { instructions: ['Outra frase totalmente distinta.'], techniques: converted },
    );
    expect(result.warnings[0]?.message).toMatch(/aparelho mudou/);
  });
});
