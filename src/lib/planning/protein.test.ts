import { describe, expect, it } from 'vitest';

import { classifyProtein } from './protein';
import { buildRecipeCard } from './test-helpers';

describe('classifyProtein', () => {
  it('reads the title', () => {
    expect(classifyProtein(buildRecipeCard({ title: 'Frango à parmegiana' }))).toBe('frango');
    expect(classifyProtein(buildRecipeCard({ title: 'Salmão ao forno' }))).toBe('peixe');
    expect(classifyProtein(buildRecipeCard({ title: 'Bife à milanesa' }))).toBe('carne');
    expect(classifyProtein(buildRecipeCard({ title: 'Omelete de queijo' }))).toBe('ovo');
  });

  it('is accent-insensitive', () => {
    expect(classifyProtein(buildRecipeCard({ title: 'Peixe grelhado' }))).toBe('peixe');
    expect(classifyProtein(buildRecipeCard({ title: 'PEIXE GRELHADO' }))).toBe('peixe');
  });

  it('falls back to tags and cuisine when the title is silent', () => {
    expect(classifyProtein(buildRecipeCard({ title: 'Prato do dia', tags: ['vegano'] }))).toBe('vegetal');
    expect(classifyProtein(buildRecipeCard({ title: 'Prato do dia', category: 'Fruto do mar' }))).toBe('peixe');
  });

  it('returns outro rather than guessing when nothing matches', () => {
    expect(classifyProtein(buildRecipeCard({ title: 'Sopa de abóbora' }))).toBe('outro');
  });
});
