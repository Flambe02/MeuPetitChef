import { describe, expect, it } from 'vitest';

import { countryForLanguage, detectLanguage, readIssue, readPublicationDate } from './identity';

describe('detectLanguage', () => {
  it('reads the function words, not the dish names', () => {
    // A cover is mostly nouns, and nouns travel between languages. "Risotto"
    // says nothing; "des", "aux" and "pour" say French.
    expect(
      detectLanguage(
        'Nos meilleures recettes pour l’été · Des tartes aux fruits · Une cuisine facile',
      ),
    ).toBe('fr');
    expect(
      detectLanguage('As nossas receitas para o verão · Tortas com frutas · Uma cozinha para você'),
    ).toBe('pt');
  });

  it('falls back rather than guessing from too little text', () => {
    expect(detectLanguage('RÉGAL', 'fr')).toBe('fr');
    expect(detectLanguage('RISOTTO', 'pt')).toBe('pt');
  });

  it('maps a language to a plausible country', () => {
    expect(countryForLanguage('pt')).toBe('BR');
    expect(countryForLanguage('fr-FR')).toBe('FR');
    expect(countryForLanguage('xx')).toBeNull();
  });
});

describe('readIssue', () => {
  it('reads the forms a masthead actually uses', () => {
    expect(readIssue('Hors-Série N°31')).toBe('Hors-Série N31');
    expect(readIssue('RÉGAL n° 167')).toBe('N°167');
    expect(readIssue('Edição 42')).toBe('N°42');
    expect(readIssue('Elle à Table #167')).toBe('N°167');
  });

  it('says nothing when there is no issue number', () => {
    expect(readIssue('SAVEURS · CUISINE DU SOLEIL')).toBeNull();
  });
});

describe('readPublicationDate', () => {
  it('reads a month and a year, in several languages', () => {
    expect(readPublicationDate('Juin 2026')).toBe('2026-06');
    expect(readPublicationDate('Junho de 2026')).toBe('2026-06');
    expect(readPublicationDate('06/2026')).toBe('2026-06');
  });

  it('keeps a bare year as a bare year rather than padding it to a lie', () => {
    expect(readPublicationDate('RÉGAL 2026')).toBe('2026');
  });

  it('says nothing when there is no date', () => {
    expect(readPublicationDate('CUISINE ACTUELLE')).toBeNull();
  });
});
