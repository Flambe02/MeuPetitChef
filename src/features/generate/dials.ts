/**
 * Making a generated step's dials safe to write.
 *
 * The import pipeline builds its dials itself, so they are correct by
 * construction. A generated recipe's dials come from the model, and the model
 * can hand back things the database refuses outright:
 *
 *   * two dials of the same kind on one step — `unique (step_id, kind)`, 23505;
 *   * a dial with neither a number nor a text — `dial_has_a_value`, 23514.
 *
 * Either one throws in the middle of `saveGeneratedDraft`, after the recipe row
 * and its ingredients are already written. The cook then has a half-saved
 * recipe and an error message, having waited twenty seconds for the chef.
 * Cheaper to clean the dials than to explain that.
 *
 * The last rule is not about constraints but about the appliance: an air fryer
 * is set in degrees, not in power levels, and when the model says "Médio" while
 * the sentence says "a 180 °C", the sentence is right.
 */
import type { EquipmentType } from '@/domain/types';
import { findTemperature } from '@/lib/recipe-import/temperature';

import type { GeneratedStep } from './api';

type Dial = GeneratedStep['dials'][number];

/** Appliances whose setting is a temperature, never a power level. */
const DEGREE_APPLIANCES: ReadonlySet<EquipmentType> = new Set<EquipmentType>(['air_fryer', 'oven']);

function hasValue(dial: Dial): boolean {
  return dial.value_num !== null || (dial.value_text !== null && dial.value_text.trim() !== '');
}

/**
 * Cleans one step's dials.
 *
 * Order matters: drop the empty ones first, then dedupe, then fix the
 * appliance — otherwise an empty `temperatura` would win the dedupe and hide a
 * temperature we could have recovered from the sentence.
 */
export function normalizeDials(step: GeneratedStep): Dial[] {
  const dials = step.dials.filter(hasValue);

  const byKind = new Map<Dial['kind'], Dial>();
  for (const dial of dials) {
    // First wins: a model that repeats a kind is correcting itself downwards
    // more often than upwards, and either way one of them has to go.
    if (!byKind.has(dial.kind)) byKind.set(dial.kind, dial);
  }

  if (DEGREE_APPLIANCES.has(step.equipment) && !byKind.has('temperatura')) {
    // The model wrote the temperature in the sentence even when it put a power
    // level in the dial. Read it back rather than lose it.
    const temperature = findTemperature(step.instruction);
    if (typeof temperature === 'number') {
      byKind.set('temperatura', {
        kind: 'temperatura',
        value_num: temperature,
        value_text: `${temperature} °C`,
        sub_label: null,
      });
      // An air fryer has no power dial; the degrees replace it.
      byKind.delete('potencia');
    }
  }

  return [...byKind.values()];
}

/** True when a step drives an appliance but says nothing about how. */
export function isMissingSettings(step: GeneratedStep, dials: Dial[]): boolean {
  if (step.equipment === 'none') return false;
  if (!DEGREE_APPLIANCES.has(step.equipment)) return false;
  return !dials.some((dial) => dial.kind === 'temperatura');
}
