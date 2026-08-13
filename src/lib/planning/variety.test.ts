import { describe, expect, it } from 'vitest';

import { buildPlannedEntry, buildRecipeCard } from './test-helpers';
import { computeWeeklyVariety } from './variety';

function chicken(id: string) {
  return buildRecipeCard({ id, title: 'Frango assado', tags: ['frango'] });
}
function fish(id: string) {
  return buildRecipeCard({ id, title: 'Salmão grelhado', tags: ['peixe'] });
}

describe('computeWeeklyVariety', () => {
  it('an empty week scores 100 with no dominant protein', () => {
    const report = computeWeeklyVariety([]);
    expect(report.score).toBe(100);
    expect(report.dominant).toBeNull();
    expect(report.suggestion).toBeNull();
  });

  it('ignores eating_out, skipped, and entries with no resolved recipe', () => {
    const entries = [
      buildPlannedEntry({ entry_type: 'eating_out', recipe_id: null }, null),
      buildPlannedEntry({ entry_type: 'skipped', recipe_id: null }, null),
      buildPlannedEntry({ id: 'e1', entry_type: 'recipe' }, null), // recipe row exists but wasn't resolved
    ];
    const report = computeWeeklyVariety(entries);
    expect(report.dominant).toBeNull();
    expect(report.score).toBe(100);
  });

  it('counts recipe and leftover entries alike', () => {
    const entries = [
      buildPlannedEntry({ id: 'e1', entry_type: 'recipe' }, chicken('r1')),
      buildPlannedEntry({ id: 'e2', entry_type: 'leftover', parent_entry_id: 'e1' }, chicken('r1')),
    ];
    const report = computeWeeklyVariety(entries);
    expect(report.proteinCounts.frango).toBe(2);
  });

  it('a balanced week (no protein over 40%) keeps a perfect score', () => {
    // Mirrors the brief's own example distribution: 3/2/2/1/2 across five types.
    const entries = [
      ...Array.from({ length: 3 }, (_, i) => buildPlannedEntry({ id: `c${i}` }, chicken(`c${i}`))),
      ...Array.from({ length: 2 }, (_, i) => buildPlannedEntry({ id: `f${i}` }, fish(`f${i}`))),
      buildPlannedEntry({ id: 'm1' }, buildRecipeCard({ id: 'm1', title: 'Carne', tags: ['carne'] })),
      buildPlannedEntry({ id: 'm2' }, buildRecipeCard({ id: 'm2', title: 'Carne', tags: ['carne'] })),
      buildPlannedEntry({ id: 'o1' }, buildRecipeCard({ id: 'o1', title: 'Ovos', tags: ['ovo'] })),
      buildPlannedEntry({ id: 'v1' }, buildRecipeCard({ id: 'v1', title: 'Vegetariano', tags: ['vegetariano'] })),
      buildPlannedEntry({ id: 'v2' }, buildRecipeCard({ id: 'v2', title: 'Vegetariano', tags: ['vegetariano'] })),
    ];
    const report = computeWeeklyVariety(entries);
    expect(report.dominant).toBe('frango');
    expect(report.score).toBe(100);
    expect(report.suggestion).toBeNull();
  });

  it('a week dominated by one protein loses points and gets a suggestion', () => {
    const entries = Array.from({ length: 5 }, (_, i) => buildPlannedEntry({ id: `c${i}` }, chicken(`c${i}`))).concat(
      buildPlannedEntry({ id: 'v1' }, buildRecipeCard({ id: 'v1', title: 'Salada', tags: ['vegetariano'] })),
    );
    const report = computeWeeklyVariety(entries);
    // 5/6 ≈ 83% share, well past both the 40% penalty line and the 50%
    // suggestion line.
    expect(report.dominant).toBe('frango');
    expect(report.score).toBeLessThan(100);
    expect(report.suggestion).toContain('frango');
  });
});
