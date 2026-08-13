import { describe, expect, it } from 'vitest';

import { normalizeSteps, requiredEquipment } from './step-normalizer';

describe('normalizeSteps — appliance detection', () => {
  /**
   * A pt-BR "fritadeira" step used to fall through every TEXT_EQUIPMENT
   * pattern (only the English/French/German air-fryer words were matched),
   * land on `equipment: 'none'`, and then get filtered out of
   * `requiredEquipment` entirely — the path ended up with no air fryer in
   * its equipment list even though the instructions clearly used one.
   */
  it('recognizes "fritadeira" as an air fryer step', () => {
    const steps = normalizeSteps([
      { text: 'Coloque as batatas na fritadeira a 200°C por 20 minutos.' },
    ]);
    expect(steps[0]?.equipment).toBe('air_fryer');
    expect(requiredEquipment(steps)).toContain('air_fryer');
  });
});
