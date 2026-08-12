import { describe, expect, it } from 'vitest';

import { recipeFingerprint, sha256Hex } from './fingerprint';
import { detectProvider, getImporter, providerIds } from './registry';

describe('detectProvider', () => {
  it('routes a URL to its importer', () => {
    expect(
      detectProvider('https://www.cookomix.com/recettes/gratin-dauphinois-thermomix/')?.id,
    ).toBe('cookomix');
    expect(detectProvider('https://cookomix.com/recettes/brownies-thermomix/')?.id).toBe(
      'cookomix',
    );
    expect(detectProvider('https://cookidoo.fr/recipes/recipe/fr-FR/r59322')?.id).toBe('cookidoo');
    expect(detectProvider('https://cookidoo.com.br/recipes/recipe/pt-BR/r12345')?.id).toBe(
      'cookidoo',
    );
  });

  it('returns null rather than guessing', () => {
    expect(detectProvider('https://www.tudogostoso.com.br/receita/1-bolo.html')).toBeNull();
    expect(detectProvider('not a url')).toBeNull();
    // A lookalike domain must not be treated as the real one.
    expect(detectProvider('https://cookomix.com.evil.example/recettes/x/')).toBeNull();
  });

  it('knows every registered provider by id', () => {
    for (const id of providerIds()) expect(getImporter(id).id).toBe(id);
    expect(() => getImporter('marmiton' as never)).toThrow();
  });
});

describe('externalIdFromUrl', () => {
  it('reads the Cookidoo recipe id out of the path', () => {
    expect(
      getImporter('cookidoo').externalIdFromUrl('https://cookidoo.fr/recipes/recipe/fr-FR/r59322'),
    ).toBe('r59322');
    expect(
      getImporter('cookidoo').externalIdFromUrl('https://cookidoo.fr/foundation/fr-FR'),
    ).toBeNull();
  });
});

describe('fingerprint', () => {
  it('matches the SHA-256 reference vectors', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('is stable across reordering and re-wording of quantities', () => {
    const a = recipeFingerprint('cookomix', 'Gratin Dauphinois', [
      { sourceName: 'Pommes de terre' },
      { sourceName: 'Crème fraîche épaisse' },
    ]);
    const b = recipeFingerprint('cookomix', 'gratin dauphinois', [
      { sourceName: 'Crème fraîche épaisse' },
      { sourceName: 'Pommes de terre' },
    ]);
    expect(a).toBe(b);
  });

  it('separates two different recipes and two providers', () => {
    const cookomix = recipeFingerprint('cookomix', 'Risotto', [{ sourceName: 'Riz' }]);
    expect(cookomix).not.toBe(recipeFingerprint('cookidoo', 'Risotto', [{ sourceName: 'Riz' }]));
    expect(cookomix).not.toBe(
      recipeFingerprint('cookomix', 'Risotto', [{ sourceName: 'Riz' }, { sourceName: 'Safran' }]),
    );
  });
});
