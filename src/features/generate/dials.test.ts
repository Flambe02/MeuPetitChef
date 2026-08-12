import { describe, expect, it } from 'vitest';

import type { EquipmentType } from '@/domain/types';

import type { GeneratedStep } from './api';
import { isMissingSettings, normalizeDials } from './dials';

type Dial = GeneratedStep['dials'][number];

const dial = (partial: Partial<Dial> & Pick<Dial, 'kind'>): Dial => ({
  value_num: null,
  value_text: null,
  sub_label: null,
  ...partial,
});

const step = (equipment: EquipmentType, instruction: string, dials: Dial[]): GeneratedStep => ({
  verb: 'Assar',
  instruction,
  equipment,
  duration_seconds: 900,
  alert_text: null,
  dials,
});

describe('normalizeDials', () => {
  it('drops a dial with no value at all', () => {
    // `dial_has_a_value` — this insert is a 23514, mid-save.
    const result = normalizeDials(
      step('thermomix', 'Misture.', [
        dial({ kind: 'tempo', value_num: 300, value_text: '05:00' }),
        dial({ kind: 'velocidade', sub_label: 'Nível' }),
      ]),
    );
    expect(result.map((entry) => entry.kind)).toEqual(['tempo']);
  });

  it('keeps only the first dial of a repeated kind', () => {
    // `unique (step_id, kind)` — this insert is a 23505, mid-save.
    const result = normalizeDials(
      step('thermomix', 'Cozinhe.', [
        dial({ kind: 'tempo', value_num: 300 }),
        dial({ kind: 'tempo', value_num: 600 }),
        dial({ kind: 'velocidade', value_num: 2 }),
      ]),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ kind: 'tempo', value_num: 300 });
  });

  it('promotes the temperature an air fryer step wrote in its sentence', () => {
    const result = normalizeDials(
      step('air_fryer', 'Asse os legumes a 180 °C por 15 minutos.', [
        dial({ kind: 'tempo', value_num: 900 }),
        dial({ kind: 'potencia', value_text: 'Médio', sub_label: 'Nível 6/9' }),
      ]),
    );

    // An air fryer is set in degrees; "Nível 6/9" is microwave language.
    expect(result.map((entry) => entry.kind)).toEqual(['tempo', 'temperatura']);
    expect(result[1]).toMatchObject({ value_num: 180, value_text: '180 °C' });
  });

  it('leaves the power dial alone when there is no temperature to recover', () => {
    // The real generated step from the screenshot: no degrees anywhere, so
    // there is nothing to promote and inventing one would be worse.
    const result = normalizeDials(
      step('air_fryer', 'Os legumes temperados na cesta da air fryer.', [
        dial({ kind: 'tempo', value_num: 300 }),
        dial({ kind: 'potencia', value_text: 'Médio', sub_label: 'Nível 6/9' }),
      ]),
    );
    expect(result.map((entry) => entry.kind)).toEqual(['tempo', 'potencia']);
  });

  it('leaves a microwave power level alone — it is the right dial there', () => {
    const result = normalizeDials(
      step('microwave', 'Aqueça por 2 minutos.', [dial({ kind: 'potencia', value_text: 'Alta' })]),
    );
    expect(result.map((entry) => entry.kind)).toEqual(['potencia']);
  });

  it('does not read a duration as a temperature', () => {
    const result = normalizeDials(
      step('air_fryer', 'Asse por 15 minutos, virando na metade.', [
        dial({ kind: 'tempo', value_num: 900 }),
      ]),
    );
    expect(result.map((entry) => entry.kind)).toEqual(['tempo']);
  });
});

describe('isMissingSettings', () => {
  it('flags an air fryer step with no temperature', () => {
    const target = step('air_fryer', 'Os legumes na cesta.', []);
    expect(isMissingSettings(target, normalizeDials(target))).toBe(true);
  });

  it('is quiet once the temperature is there', () => {
    const target = step('air_fryer', 'Asse a 200 °C.', [
      dial({ kind: 'temperatura', value_num: 200, value_text: '200 °C' }),
    ]);
    expect(isMissingSettings(target, normalizeDials(target))).toBe(false);
  });

  it('says nothing about a countertop step', () => {
    const target = step('none', 'Reserve numa tigela.', []);
    expect(isMissingSettings(target, normalizeDials(target))).toBe(false);
  });
});
