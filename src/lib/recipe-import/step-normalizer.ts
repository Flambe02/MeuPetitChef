/**
 * Instruction lines → canonical cooking steps.
 *
 * The interesting decision is which appliance a step belongs to, because that
 * is what cook mode themes its whole screen from. Two signals, in order:
 *
 *   1. The source's own label. Cookomix names every `HowToStep`
 *      ("Programmation du Thermomix", "Mise au four", "Préchauffage du four"),
 *      which is a classification the site already made and we should not redo.
 *   2. Failing that, appliance words in the sentence.
 *
 * Neither is a guess about *how* to cook — no step is ever rewritten for
 * another appliance here. That belongs to the adaptation pass.
 */
import type { EquipmentType } from '@/domain/types';

import type { CanonicalStep, RawStepLine, StepDialInput } from './types.ts';
import { fold, leadingVerb, squish } from './text.ts';
import { findDuration, formatDuration } from './duration.ts';
import { findTemperature, formatTemperature } from './temperature.ts';
import { looksLikeThermomix, parseThermomix, thermomixDials } from './thermomix.ts';

/**
 * Cookomix's step labels, mapped to appliances.
 *
 * Matched on the folded label, by prefix, so "Programmation du Thermomix" and
 * "Programmation du Thermomix (TM5)" land on the same rule.
 */
const LABEL_EQUIPMENT: [RegExp, EquipmentType][] = [
  [/^programmation/, 'thermomix'],
  [/^ajout d/, 'thermomix'], // "Ajout d'ingrédient", "Ajout d'accessoire"
  [/^ajout du couvercle/, 'thermomix'],
  [/^prechauffage du four/, 'oven'],
  [/^mise au four/, 'oven'],
  [/^cuisson au four/, 'oven'],
  [/^prechauffage de l air fryer|^air fryer/, 'air_fryer'],
];

/** Appliance words, in the four languages these sources publish in. */
const TEXT_EQUIPMENT: [RegExp, EquipmentType][] = [
  [/\bair ?fryer\b|\bfriteuse a air\b|\bheissluftfritteuse\b|\bfritadeira\b/, 'air_fryer'],
  [/\bfour\b|\bforno\b|\boven\b|\bbackofen\b|\bgratin(?:er)?\b/, 'oven'],
  [/\bmicro-?ondes?\b|\bmicro-?ondas\b|\bmicrowave\b/, 'microwave'],
  [/\bpanela de pressao\b|\bcocotte-minute\b|\bautocuiseur\b/, 'pressure_cooker'],
  [/\bbarbecue\b|\bchurrasqueira\b|\bgrill\b/, 'barbecue'],
  [
    /\bpoele\b|\bcasserole\b|\bsauteuse\b|\bfrigideira\b|\bpanela\b|\bfogao\b|\bstovetop\b|\bfeu\b/,
    'stovetop',
  ],
  [
    /\bthermomix\b|\btm[3-7]\b|\bbol\b|\bvaroma\b|\bvitesse\b|\bstufe\b|\bvelocidade\b/,
    'thermomix',
  ],
];

function equipmentFor(line: RawStepLine): EquipmentType {
  const label = fold(line.label ?? '');
  for (const [pattern, equipment] of LABEL_EQUIPMENT) {
    if (pattern.test(label)) return equipment;
  }

  const text = fold(line.text);
  for (const [pattern, equipment] of TEXT_EQUIPMENT) {
    if (pattern.test(text)) return equipment;
  }

  return looksLikeThermomix(line.text) ? 'thermomix' : 'none';
}

/** Dials for a step that is not a Thermomix program: time and temperature. */
function plainDials(durationSeconds: number | null, temperatureC: number | null): StepDialInput[] {
  const dials: StepDialInput[] = [];
  if (durationSeconds !== null) {
    dials.push({
      kind: 'tempo',
      valueNum: durationSeconds,
      valueText: formatDuration(durationSeconds),
      subLabel: null,
      position: dials.length,
    });
  }
  if (temperatureC !== null) {
    dials.push({
      kind: 'temperatura',
      valueNum: temperatureC,
      valueText: formatTemperature(temperatureC),
      subLabel: null,
      position: dials.length,
    });
  }
  return dials;
}

export function normalizeStep(line: RawStepLine, position: number): CanonicalStep {
  const instruction = squish(line.text);
  const equipment = equipmentFor(line);

  const thermomix = equipment === 'thermomix' ? parseThermomix(instruction) : null;

  // A Thermomix program's numbers live in `thermomix`; anything else reads its
  // time and temperature straight off the sentence.
  const durationSeconds = thermomix?.durationSeconds ?? findDuration(instruction);
  const sentenceTemperature = findTemperature(instruction);
  const temperatureC =
    thermomix !== null || sentenceTemperature === 'varoma' ? null : sentenceTemperature;

  return {
    position,
    verb: line.label ? squish(line.label) : leadingVerb(instruction),
    instruction,
    equipment,
    durationSeconds,
    temperatureC,
    thermomix,
    sourceText: line.text,
    sourceLabel: line.label ?? null,
  };
}

export function normalizeSteps(lines: RawStepLine[]): CanonicalStep[] {
  return lines
    .filter((line) => squish(line.text).length > 0)
    .map((line, index) => normalizeStep(line, index));
}

/** Every dial a step should carry, whichever appliance it runs on. */
export function stepDials(step: CanonicalStep): StepDialInput[] {
  if (step.thermomix) return thermomixDials(step.thermomix);
  return plainDials(step.durationSeconds, step.temperatureC);
}

/** The appliances a path needs. `none` is a step type, not a requirement. */
export function requiredEquipment(steps: CanonicalStep[]): EquipmentType[] {
  return [...new Set(steps.map((step) => step.equipment))].filter(
    (equipment) => equipment !== 'none',
  );
}
