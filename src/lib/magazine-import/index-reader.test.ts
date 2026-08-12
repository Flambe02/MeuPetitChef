import { describe, expect, it } from 'vitest';

import { findIndexEntry, mergeIndexes, readIndexFromText } from './index-reader';

const INDEX = `
SOMMAIRE DES RECETTES

Gaspacho de tomate ......................... 53
Gambas panées et sauce au citron vert ...... 61
Brochettes de crevettes et courgettes        60
Tarte fine aux abricots, p. 72
Édito ...................................... 3
Abonnement ................................. 96
Entrées 12
`;

describe('readIndexFromText', () => {
  const entries = readIndexFromText(INDEX);

  it('reads dot leaders, bare columns and "p." alike', () => {
    expect(entries).toContainEqual({ title: 'Gaspacho de tomate', folio: 53 });
    expect(entries).toContainEqual({
      title: 'Brochettes de crevettes et courgettes',
      folio: 60,
    });
    expect(entries).toContainEqual({ title: 'Tarte fine aux abricots', folio: 72 });
  });

  it('drops magazine furniture, which is not a recipe', () => {
    // Left in, these send the pipeline to extract the editorial and the
    // subscription form at full price.
    const titles = entries.map((entry) => entry.title);
    expect(titles).not.toContain('Édito');
    expect(titles).not.toContain('Abonnement');
  });

  it('drops a bare section header', () => {
    expect(entries.map((entry) => entry.title)).not.toContain('Entrées');
  });
});

describe('mergeIndexes', () => {
  it('unions the text pass and the model pass without duplicating', () => {
    const merged = mergeIndexes(
      [{ title: 'Gaspacho', folio: 53 }],
      [
        { title: 'Gaspacho', folio: 53 },
        { title: 'Tarte fine', folio: 72 },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]?.folio).toBe(53);
  });
});

describe('findIndexEntry', () => {
  const entries = [
    { title: 'Gambas panées et sauce au citron vert', folio: 61 },
    { title: 'Tarte aux pommes', folio: 72 },
    { title: 'Tarte au citron', folio: 74 },
  ];

  it('matches across capitalisation and punctuation', () => {
    expect(findIndexEntry('GAMBAS PANÉES & SAUCE AU CITRON VERT', entries)?.folio).toBe(61);
  });

  it('matches a shortened title', () => {
    expect(
      findIndexEntry('Gambas panées et sauce au citron vert, façon plancha', entries)?.folio,
    ).toBe(61);
  });

  it('refuses to match two different dishes that share a word', () => {
    expect(findIndexEntry('Tarte', entries)).toBeNull();
  });
});
