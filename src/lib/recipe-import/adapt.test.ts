import { describe, expect, it } from 'vitest';

import {
  adaptWithRetry,
  machineFacts,
  sanitizeAdaptation,
  verifyAdaptation,
  type AdaptationRequest,
  type AdaptationResult,
} from './adapt';

/* A real Cookomix step, and its correct Brazilian rewrite. */
const request: AdaptationRequest = {
  recipeId: 'r1',
  sourceLanguage: 'fr-FR',
  title: 'Gratin Dauphinois au thermomix',
  subtitle: null,
  description: 'Le vrai gratin dauphinois.',
  servings: 6,
  ingredients: [
    { id: 'i1', displayName: 'Crème fraîche épaisse', quantity: 500, unit: 'g', note: null },
    { id: 'i2', displayName: 'Pommes de terre', quantity: 1200, unit: 'g', note: null },
  ],
  steps: [
    { id: 's1', verb: 'Mettre', instruction: 'Mettre 500 grammes de crème fraîche dans le bol.' },
    { id: 's2', verb: 'Cuire', instruction: 'Cuire 20 min/100°C/Vitesse Cuillère.' },
    { id: 's3', verb: null, instruction: 'Mettre dans le four pendant 25 min à 210°C.' },
  ],
  notes: [{ id: 'n1', title: 'Fonte', body: 'Importado de cookomix: https://…' }],
};

const good: AdaptationResult = {
  title: 'Gratinado dauphinois',
  subtitle: null,
  description: 'O verdadeiro gratinado dauphinois.',
  ingredients: [
    {
      id: 'i1',
      displayName: 'creme de leite fresco',
      note: null,
      substitution: 'Crème fraîche épaisse não existe no Brasil.',
    },
    { id: 'i2', displayName: 'batata', note: null, substitution: null },
  ],
  steps: [
    { id: 's1', verb: 'Colocar', instruction: 'Coloque 500 g de creme de leite fresco no copo.' },
    { id: 's2', verb: 'Cozinhar', instruction: 'Cozinhe 20 min/100°C/vel. colher.' },
    { id: 's3', verb: 'Assar', instruction: 'Leve ao forno por 25 min a 210°C.' },
  ],
  notes: [{ id: 'n1', title: 'Fonte', body: 'Importado de cookomix: https://…' }],
};

const withStep = (id: string, instruction: string): AdaptationResult => ({
  ...good,
  steps: good.steps.map((step) => (step.id === id ? { ...step, instruction } : step)),
});

describe('machineFacts', () => {
  it('reads the same facts out of a French and a Brazilian sentence', () => {
    // The whole trick: comparing translations is impossible, comparing the
    // numbers behind them is not.
    expect(machineFacts('Cuire 20 min/100°C/Vitesse Cuillère.')).toEqual(
      machineFacts('Cozinhe 20 min/100°C/vel. colher.'),
    );
    expect(machineFacts('Mettre dans le four pendant 25 min à 210°C.')).toEqual(
      machineFacts('Leve ao forno por 25 min a 210°C.'),
    );
  });
});

describe('adaptWithRetry', () => {
  it('asks again when the answer does not verify', async () => {
    // The real failure this exists for: on a first catalogue run the model
    // dropped the "Eau" line from a risotto, then returned it on the next ask.
    const answers: AdaptationResult[] = [
      { ...good, ingredients: good.ingredients.slice(0, 1) },
      good,
    ];
    let calls = 0;
    const attempt = await adaptWithRetry(request, () => {
      const adapted = answers[calls] ?? good;
      calls += 1;
      return Promise.resolve({ adapted, model: 'test' });
    });

    expect(calls).toBe(2);
    expect(attempt.attempts).toBe(2);
    expect(attempt.validation.ok).toBe(true);
  });

  it('gives up rather than lower the bar', async () => {
    const broken = withStep('s2', 'Cozinhe 5 min/100°C/vel. colher.');
    let calls = 0;
    await expect(
      adaptWithRetry(
        request,
        () => {
          calls += 1;
          return Promise.resolve({ adapted: broken, model: 'test' });
        },
        3,
      ),
    ).rejects.toThrow(/3 tentativas/);
    expect(calls).toBe(3);
  });

  it('stops at the first answer that holds up', async () => {
    let calls = 0;
    const attempt = await adaptWithRetry(request, () => {
      calls += 1;
      return Promise.resolve({ adapted: good, model: 'test' });
    });
    expect(calls).toBe(1);
    expect(attempt.attempts).toBe(1);
  });
});

describe('sanitizeAdaptation', () => {
  it('turns the string "null" into an actual null', () => {
    // Seen on the very first real run: the model answered "null" as four
    // characters for all six ingredients, and the note "null" was written to
    // every line in the database.
    const dirty: AdaptationResult = {
      ...good,
      ingredients: good.ingredients.map((item) => ({
        ...item,
        note: 'null',
        substitution: 'null',
      })),
    };
    const clean = sanitizeAdaptation(dirty);
    expect(clean.ingredients.every((item) => item.note === null)).toBe(true);
    expect(clean.ingredients.every((item) => item.substitution === null)).toBe(true);
  });

  it('does not report a false substitution once cleaned', () => {
    const dirty: AdaptationResult = {
      ...good,
      ingredients: good.ingredients.map((item) => ({ ...item, substitution: 'null' })),
    };
    const warnings = verifyAdaptation(request, sanitizeAdaptation(dirty)).warnings;
    expect(warnings.filter((w) => w.code === 'ingredient_substituted')).toHaveLength(0);
  });

  it('keeps a real substitution', () => {
    const clean = sanitizeAdaptation(good);
    expect(clean.ingredients[0]?.substitution).toBe('Crème fraîche épaisse não existe no Brasil.');
  });

  it('treats the other ways a model says nothing as nothing', () => {
    const dirty: AdaptationResult = {
      ...good,
      subtitle: 'N/A',
      description: '   ',
      notes: [{ id: 'n1', title: 'none', body: 'Importado de cookomix' }],
    };
    const clean = sanitizeAdaptation(dirty);
    expect(clean.subtitle).toBeNull();
    expect(clean.description).toBeNull();
    expect(clean.notes[0]?.title).toBeNull();
  });
});

describe('verifyAdaptation', () => {
  it('accepts a faithful rewrite', () => {
    const result = verifyAdaptation(request, good);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports substitutions as warnings, not errors', () => {
    const result = verifyAdaptation(request, good);
    const substitutions = result.warnings.filter((w) => w.code === 'ingredient_substituted');
    expect(substitutions).toHaveLength(1);
    expect(substitutions[0]?.message).toContain('creme de leite fresco');
  });

  it('refuses a rewrite that changed a duration', () => {
    // The failure that matters: reads perfectly, cooks for a quarter of the time.
    const result = verifyAdaptation(request, withStep('s2', 'Cozinhe 5 min/100°C/vel. colher.'));
    expect(result.ok).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('duration_changed');
  });

  it('refuses a rewrite that changed a temperature', () => {
    const result = verifyAdaptation(request, withStep('s2', 'Cozinhe 20 min/90°C/vel. colher.'));
    expect(result.errors.map((issue) => issue.code)).toContain('temperature_changed');
  });

  it('refuses a rewrite that changed a Thermomix speed', () => {
    const result = verifyAdaptation(request, withStep('s2', 'Cozinhe 20 min/100°C/vel. 4.'));
    expect(result.errors.map((issue) => issue.code)).toContain('speed_changed');
  });

  it('refuses a rewrite that dropped the parameters into prose', () => {
    const result = verifyAdaptation(request, withStep('s2', 'Cozinhe por cerca de vinte minutos.'));
    expect(result.ok).toBe(false);
  });

  it('refuses a rewrite that lost or invented a step', () => {
    const missing = { ...good, steps: good.steps.slice(0, 2) };
    const codes = verifyAdaptation(request, missing).errors.map((issue) => issue.code);
    expect(codes).toContain('step_count_changed');
    expect(codes).toContain('step_missing');
  });

  it('refuses a rewrite that lost an ingredient', () => {
    const missing = { ...good, ingredients: good.ingredients.slice(0, 1) };
    const codes = verifyAdaptation(request, missing).errors.map((issue) => issue.code);
    expect(codes).toContain('ingredient_missing');
  });

  it('warns when a step comes back without a verb', () => {
    const noVerb = {
      ...good,
      steps: good.steps.map((step) => (step.id === 's2' ? { ...step, verb: '' } : step)),
    };
    expect(verifyAdaptation(request, noVerb).warnings.map((w) => w.code)).toContain('verb_missing');
  });

  it('matches by id, so a reordered answer is not scrambled', () => {
    const reordered = { ...good, steps: [...good.steps].reverse() };
    expect(verifyAdaptation(request, reordered).ok).toBe(true);
  });
});
