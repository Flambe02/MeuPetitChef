/**
 * Thermomix step parsing — the part of the import that actually carries value.
 *
 * A Thermomix instruction is a control-panel program written as a sentence.
 * These are real lines from live Cookomix pages:
 *
 *   Cuire 20 min/100°C/Vitesse Cuillère.
 *   Rissoler 3 min 30 sec/120°C/vitesse 1.
 *   Mélanger 2 min/vitesse pétrin.
 *   Cuire 15 min/Varoma/Vitesse Cuillère.
 *   Chauffer 2 min/37°C/vitesse 2.
 *
 * and the same grammar in the other Cookidoo locales:
 *
 *   5 Min./100°C/Stufe 1        20 Sek./Stufe 5
 *   20 min/100°C/speed 1        10 sec/speed 5
 *   20 min/100°C/vel. colher    5 seg/vel. 5
 *
 * The shape is always the same: slash-separated segments, each of which is a
 * duration, a temperature, a speed, or a mode (reverse / turbo / knead). So the
 * parser splits and classifies rather than trying to write one regex that knows
 * every ordering — new locales then cost a word in a table, not a rewrite.
 */
import type { StepDialInput, ThermomixSettings } from './types.ts';
import { fold, squish } from './text.ts';
import { formatDuration, parseDuration } from './duration.ts';
import { formatTemperature, parseTemperature } from './temperature.ts';

/** Highest speed on the dial. Anything above is a parse error, not a speed. */
const MAX_SPEED = 10;

const REVERSE = /\b(sens inverse|inverse|marche arriere|reverse|linkslauf|inverso|antihorario)\b/;
const TURBO = /\bturbo\b/;
const KNEAD = /\b(petrin|petrissage|amassar|knead|teigstufe|modo espiga|fonction epi)\b/;
/** Spoon speed and the TM6 "mijotage" both live at the bottom of the dial. */
const SPOON = /\b(cuillere|colher|spoon|mijotage|loffel|linksla)\b/;
const SPEED_WORD = /\b(vitesse|vit|vel|velocidade|speed|stufe|geschwindigkeit)\b/;
const VAROMA_WORD = /\bvaroma\b/;
const TIME_WORD =
  /\b(\d+\s*(s|sec|secs|seg|segs|sek|second|secondes?|segundos?|m|min|mins|minutes?|minutos?|h|heures?|horas?|stunden?))\b/;

/**
 * True when a sentence looks like a Thermomix program at all.
 *
 * Used to decide whether a step is `equipment = 'thermomix'`; a sentence that
 * only mentions the bowl ("dans le bol du Thermomix") counts, because that is
 * still an action performed on the machine.
 */
export function looksLikeThermomix(sentence: string): boolean {
  const text = fold(sentence);
  return (
    /\bthermomix\b|\bthermomix\b|\btm[3-7]\b|\bbol du thermomix\b/.test(text) ||
    SPEED_WORD.test(text) ||
    VAROMA_WORD.test(text) ||
    KNEAD.test(text) ||
    TURBO.test(text)
  );
}

/**
 * True when a sentence is a machine *program* rather than a machine action.
 *
 * "Cuire 20 min/100°C/Vitesse Cuillère" is a program; "Ajouter 1 gousse d'ail
 * dans le bol du Thermomix" is not, even though both are Thermomix steps. The
 * difference is what the "parameters detected: n/m" ratio counts, and what
 * makes a missing dial worth warning about.
 */
export function looksLikeProgram(sentence: string): boolean {
  const text = fold(sentence);
  return (
    /\b(vitesse|vit|vel|velocidade|speed|stufe|geschwindigkeit)\b\s*\S/.test(text) ||
    VAROMA_WORD.test(text) ||
    TURBO.test(text) ||
    KNEAD.test(text) ||
    REVERSE.test(text)
  );
}

export function emptySettings(): ThermomixSettings {
  return {
    durationSeconds: null,
    temperatureC: null,
    speed: null,
    speedText: null,
    reverse: false,
    turbo: false,
    varomaAccessory: false,
  };
}

function hasAnything(settings: ThermomixSettings): boolean {
  return (
    settings.durationSeconds !== null ||
    settings.temperatureC !== null ||
    settings.speed !== null ||
    settings.reverse ||
    settings.turbo ||
    settings.varomaAccessory
  );
}

/**
 * Reads a speed out of one segment. Returns `undefined` when it is not one.
 *
 * Named speeds require the word "vitesse" (or its local equivalent) to be in
 * the same segment, unless the segment *is* the name. Without that rule
 * "Ajouter ½ cuillère à café de sel" parses as spoon speed, and the step ends
 * up with a velocity dial it never had — the measuring spoon and the machine's
 * spoon setting are the same word in French.
 */
function readSpeed(segment: string): ThermomixSettings['speed'] | undefined {
  const folded = fold(segment);
  const named = SPEED_WORD.test(folded);
  const isBareWord = (pattern: RegExp) => pattern.test(folded) && folded.split(' ').length <= 2;

  if (KNEAD.test(folded) && (named || isBareWord(KNEAD))) return 'knead';
  // Turbo is unambiguous: no kitchen object is called a turbo.
  if (TURBO.test(folded)) return 'turbo';
  if (SPOON.test(folded) && (named || isBareWord(SPOON))) return 'spoon';

  // "vitesse 5", "Stufe 1", "vel. 5", or a bare "5" once we already know the
  // segment is a speed slot.
  const match = /(\d+(?:[.,]\d+)?)/.exec(folded);
  if (!match?.[1]) return undefined;
  if (!named && !/^\s*\d+(?:[.,]\d+)?\s*$/.test(folded)) return undefined;

  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > MAX_SPEED) return undefined;
  return value;
}

/**
 * Parses a Thermomix program out of an instruction.
 *
 * Returns null when the sentence carries no machine settings at all — a step
 * like "Racler les parois du bol avec la spatule" is a real Thermomix step but
 * has no dials, and inventing `speed 0` for it would put a false readout on the
 * cook-mode screen.
 */
export function parseThermomix(instruction: string): ThermomixSettings | null {
  const text = squish(instruction);
  if (!text) return null;

  const settings = emptySettings();

  // Everything before the first slash usually holds the verb and the duration
  // ("Cuire 20 min"), so it is classified like any other segment.
  const segments = text
    .split(/[/·|]/)
    .map((segment) => squish(segment.replace(/\.$/, '')))
    .filter(Boolean);

  for (const segment of segments) {
    const folded = fold(segment);

    if (REVERSE.test(folded)) {
      settings.reverse = true;
      // "sens inverse" may share a segment with a speed: "sens inverse/vitesse 1"
      // is common but so is "vitesse 1 sens inverse".
    }
    if (TURBO.test(folded)) settings.turbo = true;

    // A bare "Varoma" *slot inside a program* is the temperature setting
    // ("Cuire 15 min/Varoma/Vitesse Cuillère"). The same word in a sentence of
    // its own is the steaming dish ("Ajouter le Varoma"), which is an
    // accessory and must not become a temperature dial.
    const isVaromaSlot =
      VAROMA_WORD.test(folded) &&
      !TIME_WORD.test(folded) &&
      segments.length > 1 &&
      folded.split(' ').length <= 2;
    if (isVaromaSlot) {
      settings.temperatureC = 'varoma';
      continue;
    }

    if (/°|º|\bdegres?\b|\bgraus?\b/.test(folded) || /\b\d+\s*c\b/.test(folded)) {
      const temperature = parseTemperature(segment);
      if (temperature !== null) {
        settings.temperatureC = temperature;
        continue;
      }
    }

    if (TIME_WORD.test(folded) || /^\d{1,2}:\d{2}$/.test(folded)) {
      const duration = parseDuration(segment);
      if (duration !== null) {
        // Only the first duration is the program's timer; a later one belongs to
        // a sentence like "…et laisser reposer 10 min".
        settings.durationSeconds ??= duration;
        continue;
      }
    }

    const speed = readSpeed(segment);
    if (speed !== undefined) {
      settings.speed ??= speed;
      settings.speedText ??= squish(segment);
    }
  }

  // "Ajouter le Varoma" / "Mettre la viande dans le Varoma" — the dish, not a
  // temperature. Recognised by the absence of any program around it.
  if (VAROMA_WORD.test(fold(text)) && settings.temperatureC === null && settings.speed === null) {
    settings.varomaAccessory = true;
  }

  if (settings.turbo && settings.speed === null) settings.speed = 'turbo';
  if (settings.speed === 'knead' && settings.temperatureC === null) {
    // Kneading is unheated by definition; leaving temperature null is correct
    // and this comment exists so nobody "fixes" it to 37 °C.
  }

  return hasAnything(settings) ? settings : null;
}

/* ---------------------------------------------------------------------------
 * Display
 * ------------------------------------------------------------------------- */

const SPEED_LABEL: Record<'spoon' | 'knead' | 'turbo', string> = {
  spoon: 'Colher',
  knead: 'Amassar',
  turbo: 'Turbo',
};

/** What the velocity dial prints, in pt-BR. */
export function formatSpeed(settings: ThermomixSettings): string | null {
  if (settings.speed === null) return null;
  if (typeof settings.speed === 'number') return String(settings.speed);
  return SPEED_LABEL[settings.speed];
}

/**
 * Thermomix settings → `cooking_step_dials` rows.
 *
 * `value_num` is the machine-usable number (timers, comparisons) and
 * `value_text` is what the screen prints, which is exactly the split the table
 * was designed around. One dial per kind, because the table is unique on
 * (step_id, kind).
 */
export function thermomixDials(settings: ThermomixSettings): StepDialInput[] {
  const dials: StepDialInput[] = [];

  if (settings.durationSeconds !== null) {
    dials.push({
      kind: 'tempo',
      valueNum: settings.durationSeconds,
      valueText: formatDuration(settings.durationSeconds),
      subLabel: null,
      position: dials.length,
    });
  }

  if (settings.temperatureC !== null) {
    dials.push({
      kind: 'temperatura',
      valueNum: typeof settings.temperatureC === 'number' ? settings.temperatureC : null,
      valueText: formatTemperature(settings.temperatureC),
      subLabel: null,
      position: dials.length,
    });
  }

  const speedText = formatSpeed(settings);
  if (speedText !== null) {
    dials.push({
      kind: 'velocidade',
      valueNum: typeof settings.speed === 'number' ? settings.speed : null,
      valueText: speedText,
      // Preserves "vitesse mijotage" when the union flattened it to "Colher".
      subLabel: settings.speedText,
      position: dials.length,
    });
  }

  const modes: string[] = [];
  if (settings.reverse) modes.push('Inverso');
  if (settings.varomaAccessory) modes.push('Varoma');
  if (settings.turbo && settings.speed !== 'turbo') modes.push('Turbo');
  if (modes.length > 0) {
    dials.push({
      kind: 'modo',
      valueNum: null,
      valueText: modes.join(' · '),
      subLabel: null,
      position: dials.length,
    });
  }

  return dials;
}
