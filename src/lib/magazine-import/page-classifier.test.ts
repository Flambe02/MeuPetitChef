import { describe, expect, it } from 'vitest';

import { detectFolioOffset, folioToIndex, readFolio } from './folio';
import { classifyByText, looksLikeIngredientLine } from './page-classifier';
import type { MagazinePage } from './types';

const page = (over: Partial<MagazinePage> & { index: number }): MagazinePage => ({
  folio: null,
  text: '',
  hasLargeImage: false,
  ...over,
});

const RECIPE_PAGE = `
GASPACHO DE TOMATE
Pour 4 personnes
Préparation : 20 min · Repos : 2 h

Ingrédients
1 kg de tomates bien mûres
1 concombre
2 gousses d'ail
5 cl d'huile d'olive
1 c. à soupe de vinaigre de Xérès
sel, poivre

Préparation
1. Pelez les tomates et coupez-les grossièrement.
2. Mixez tous les légumes avec l'huile et le vinaigre.
3. Réservez au frais deux heures avant de servir.
53
`;

const ARTICLE_PAGE = `
LE RETOUR DES LÉGUMES OUBLIÉS

${'Longtemps relégués au rang de souvenir, les panais, topinambours et rutabagas reviennent sur les étals. '.repeat(8)}
`;

const INDEX_PAGE = `
INDEX DES RECETTES

Gaspacho de tomate ......................... 53
Gambas panées et sauce au citron vert ...... 61
Brochettes de crevettes .................... 60
Tarte fine aux abricots .................... 72
Crème glacée à la vanille .................. 78
Édito ...................................... 3
`;

describe('looksLikeIngredientLine', () => {
  it('accepts quantity-led lines, with or without a unit', () => {
    expect(looksLikeIngredientLine('1 kg de tomates bien mûres')).toBe(true);
    expect(looksLikeIngredientLine('2 gousses d’ail')).toBe(true);
    expect(looksLikeIngredientLine('1 concombre')).toBe(true);
    expect(looksLikeIngredientLine('½ citron vert')).toBe(true);
  });

  it('refuses a numbered step, which is the mistake that matters', () => {
    // Counted as an ingredient, every how-to article becomes a "recipe" and
    // gets sent to the vision model at full price.
    expect(looksLikeIngredientLine('1. Pelez les tomates et coupez-les.')).toBe(false);
    expect(looksLikeIngredientLine('3) Mixez le tout au blender.')).toBe(false);
  });

  it('refuses a sentence that happens to start with a number', () => {
    expect(
      looksLikeIngredientLine('4 chefs racontent leur été passé au bord de la Méditerranée'),
    ).toBe(false);
  });
});

describe('classifyByText', () => {
  const context = { pageCount: 100 };

  it('calls the first page the cover without asking a model', () => {
    const verdict = classifyByText(page({ index: 1, text: 'RÉGAL\nHors-Série N31' }), context);
    expect(verdict?.kind).toBe('cover');
    expect(verdict?.by).toBe('text');
  });

  it('recognises a recipe from its shape', () => {
    const verdict = classifyByText(page({ index: 53, text: RECIPE_PAGE }), context);
    expect(verdict?.kind).toBe('recipe');
    expect(verdict?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('recognises a recipe index', () => {
    const verdict = classifyByText(page({ index: 98, text: INDEX_PAGE }), context);
    expect(verdict?.kind).toBe('recipe_index');
  });

  it('recognises prose with no recipe furniture', () => {
    const verdict = classifyByText(page({ index: 20, text: ARTICLE_PAGE }), context);
    expect(verdict?.kind).toBe('article');
  });

  it('refuses to decide when there is no text layer', () => {
    // A full-page photograph and a scanned page look identical from here, and
    // neither is an advert. Null means "ask the model", which is the only
    // honest answer.
    expect(classifyByText(page({ index: 12, text: 'RÉGAL' }), context)).toBeNull();
    expect(classifyByText(page({ index: 12, text: '' }), context)).toBeNull();
  });
});

describe('folio', () => {
  it('reads the number printed alone at the foot of a page', () => {
    expect(readFolio('…\n\n53')).toBe(53);
    expect(readFolio('RÉGAL 61\nGambas panées')).toBe(61);
  });

  it('does not read a temperature as a page number', () => {
    expect(readFolio('Enfournez à 180 °C pendant 25 minutes et servez aussitôt.')).toBeNull();
  });

  it('measures the offset between printed and file numbering', () => {
    // Four unnumbered front pages: file page 10 prints "6".
    const pages = [6, 7, 8, 9, 10].map((folio, position) =>
      page({ index: position + 10, text: `…\n${String(folio)}` }),
    );
    expect(detectFolioOffset(pages)).toBe(-4);
  });

  it('says nothing rather than inventing an offset', () => {
    expect(detectFolioOffset([page({ index: 1, text: 'RÉGAL' })])).toBeNull();
  });

  it('turns a printed page number into a file position, inside the file', () => {
    expect(folioToIndex(53, -4, 100)).toBe(57);
    expect(folioToIndex(53, null, 100)).toBe(53);
    expect(folioToIndex(200, -4, 100)).toBe(100);
  });
});
