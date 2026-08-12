/**
 * Using an imported recipe as a *reference* rather than as content.
 *
 * The distinction this file exists to enforce is the one the law actually
 * draws: an idea is not protected, its expression is. Reading that a gratin
 * dauphinois is potatoes, cream, garlic and nutmeg, cooked 20 min at 100 °C and
 * then 25 min in a 210 °C oven, and writing your own recipe from that, is
 * legitimate — those are facts. Taking the sentences and translating them is an
 * adaptation, which is exactly what Cookomix's terms forbid.
 *
 * So a reference never leaves this module as prose. What comes out is a brief:
 * the dish, the ingredients, the technique as numbers. The generator then
 * writes its own recipe for the appliances the cook actually owns — and since
 * an air fryer version of a gratin is a genuinely different procedure, the
 * result is new expression rather than a paraphrase.
 *
 * `checkOriginality` is the mechanical backstop for when it is not.
 */
import type { EquipmentType } from '@/domain/types';

import type { AdaptationRequest } from './adapt.ts';
import { machineFacts } from './adapt.ts';
import { fold, squish } from './text.ts';
import { formatDuration } from './duration.ts';
import type { ValidationIssue, ValidationResult } from './types.ts';

/* ---------------------------------------------------------------------------
 * The facts
 * ------------------------------------------------------------------------- */

export interface TechniqueFact {
  /** Which appliance the reference used for this stage. */
  equipment: EquipmentType;
  durationSeconds: number | null;
  temperature: number | 'varoma' | null;
  speed: number | string | null;
}

export interface RecipeFacts {
  dish: string;
  servings: number;
  /** Names and quantities only — never the source's phrasing. */
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
  /** The cooking parameters, in order. Numbers, not sentences. */
  techniques: TechniqueFact[];
  sourceProvider: string | null;
}

/**
 * Reduces a reference to what is not protectable.
 *
 * Deliberately lossy: the instruction text, the description, the author's
 * headnotes and the step wording are all dropped here and never travel
 * further. What survives is a list of ingredients and a sequence of appliance
 * settings — the recipe as a procedure, not as a piece of writing.
 */
export function extractFacts(
  reference: AdaptationRequest,
  steps: { equipment: EquipmentType; instruction: string }[],
  sourceProvider: string | null = null,
): RecipeFacts {
  const techniques: TechniqueFact[] = [];

  for (const step of steps) {
    const facts = machineFacts(step.instruction);
    // A step with no numbers carries no technique worth recording — it is
    // "stir", "set aside", "serve", which any cook writes for themselves.
    if (facts.durationSeconds === null && facts.temperature === null && facts.speed === null) {
      continue;
    }
    techniques.push({
      equipment: step.equipment,
      durationSeconds: facts.durationSeconds,
      temperature: facts.temperature,
      speed: facts.speed,
    });
  }

  return {
    dish: squish(reference.title),
    servings: reference.servings,
    ingredients: reference.ingredients.map((item) => ({
      name: squish(item.displayName),
      quantity: item.quantity,
      unit: item.unit,
    })),
    techniques,
    sourceProvider,
  };
}

/** One technique, written as a line of parameters rather than as a sentence. */
function describeTechnique(fact: TechniqueFact): string {
  const parts: string[] = [fact.equipment];
  if (fact.durationSeconds !== null) parts.push(formatDuration(fact.durationSeconds) ?? '');
  if (fact.temperature !== null) {
    parts.push(fact.temperature === 'varoma' ? 'Varoma' : `${fact.temperature} °C`);
  }
  if (fact.speed !== null) parts.push(`vel. ${String(fact.speed)}`);
  return parts.filter(Boolean).join(' · ');
}

/**
 * Turns the facts into a brief for `generate-recipe`.
 *
 * Note what the brief does *not* contain: no sentence from the source, no
 * description, no step wording. The generator is told what dish to write and
 * what the reference's timings were, and writes its own procedure for the
 * requested appliances.
 */
export function buildBrief(facts: RecipeFacts, equipment: EquipmentType[]): string {
  const ingredients = facts.ingredients
    .map((item) =>
      [item.quantity ?? '', item.unit ?? '', item.name].filter((part) => part !== '').join(' '),
    )
    .join('; ');

  const lines = [
    `Escreva do zero uma receita de "${facts.dish}" para ${facts.servings} porções.`,
    `Ingredientes que a receita deve usar: ${ingredients}.`,
  ];

  if (facts.techniques.length > 0) {
    lines.push(
      'Como referência técnica, o preparo original usou estes parâmetros, nesta ordem: ' +
        facts.techniques.map(describeTechnique).join(' | ') +
        '.',
    );
    lines.push(
      'Use-os apenas como ponto de partida para o tempo e a temperatura corretos: ' +
        'o passo a passo deve ser escrito por você, com suas próprias palavras, ' +
        'e ajustado aos aparelhos pedidos.',
    );
  }

  lines.push(
    `Escreva o preparo para estes aparelhos: ${equipment.join(', ')}. ` +
      'Se o aparelho for diferente do original, a técnica muda: reescreva o método, ' +
      'não traduza o original.',
  );

  return lines.join(' ');
}

/* ---------------------------------------------------------------------------
 * Originality
 * ------------------------------------------------------------------------- */

/** Word trigrams, folded. The unit of "this sentence came from there". */
function trigrams(texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    const words = fold(text)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (let index = 0; index + 2 < words.length; index += 1) {
      out.add(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
    }
  }
  return out;
}

/** Share of the new text that already existed in the source, 0 to 1. */
export function verbatimOverlap(sourceTexts: string[], generatedTexts: string[]): number {
  const source = trigrams(sourceTexts);
  const generated = trigrams(generatedTexts);
  if (generated.size === 0) return 0;

  let shared = 0;
  for (const gram of generated) if (source.has(gram)) shared += 1;
  return shared / generated.size;
}

/** Above this, the new text is not a rewrite, it is the old text. */
const VERBATIM_LIMIT = 0.2;

/**
 * Checks that a generated recipe is a new piece of writing, not a decal.
 *
 * Two signals, and they are honest about what they can see:
 *
 *   * **verbatim overlap** — shared word trigrams. Catches same-language
 *     copying, which is the real risk when the reference is Brazilian. It says
 *     nothing about a translation, since no trigram survives crossing
 *     languages; that is a limit of the measure, not a clean bill of health.
 *   * **identical parameter sequence** — the same appliance settings, in the
 *     same order, in the same number of steps. Physics forces some of this
 *     (potatoes boil at 100 °C), so it is a warning, never an error — but a
 *     recipe written for a *different* appliance that still matches the
 *     original's sequence exactly has not really been rewritten.
 */
export function checkOriginality(
  reference: { instructions: string[]; techniques: TechniqueFact[] },
  generated: { instructions: string[]; techniques: TechniqueFact[] },
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const overlap = verbatimOverlap(reference.instructions, generated.instructions);
  if (overlap > VERBATIM_LIMIT) {
    errors.push({
      code: 'verbatim_overlap',
      message:
        `${Math.round(overlap * 100)} % do texto gerado repete frases da referência. ` +
        'Isso é uma cópia, não uma inspiração.',
    });
  } else if (overlap > VERBATIM_LIMIT / 2) {
    warnings.push({
      code: 'verbatim_overlap',
      message: `${Math.round(overlap * 100)} % do texto lembra a referência — vale reler.`,
    });
  }

  const sameSequence =
    reference.techniques.length > 0 &&
    reference.techniques.length === generated.techniques.length &&
    reference.techniques.every((fact, index) => {
      const other = generated.techniques[index];
      return (
        other !== undefined &&
        fact.durationSeconds === other.durationSeconds &&
        fact.temperature === other.temperature &&
        fact.speed === other.speed
      );
    });

  if (sameSequence) {
    const sameAppliances = reference.techniques.every(
      (fact, index) => generated.techniques[index]?.equipment === fact.equipment,
    );
    warnings.push({
      code: 'identical_technique_sequence',
      message: sameAppliances
        ? 'O preparo repete exatamente os mesmos parâmetros da referência — confira se é mesmo uma receita nova.'
        : 'Os parâmetros são idênticos aos da referência, mas o aparelho mudou — isso quase nunca é correto na prática.',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}
