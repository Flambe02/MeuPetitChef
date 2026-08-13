import { describe, expect, it } from 'vitest';

import { fr } from './fr';
import { pt } from './pt';

/**
 * `fr`'s type (`Record<TranslationKey, string>`) already forces every `pt`
 * key to exist and forbids extras — a key added to one file and forgotten in
 * the other is a compile error, never reaches this file. What TypeScript
 * cannot check is the *content*: an empty string compiles fine, and a
 * `{placeholder}` typo'd differently between the two dictionaries would
 * silently leave literal `{step}` on screen in French forever.
 */
describe('the fr dictionary', () => {
  it('has no empty or whitespace-only translation', () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value.trim(), `fr['${key}'] is empty`).not.toBe('');
    }
  });

  it('never repeats the pt-BR string verbatim for a key with actual words to translate', () => {
    // Short brand-ish tokens ("PT / FR", equipment names that are the same
    // loanword in both languages) are expected to match — this only flags
    // the case that actually indicates a forgotten translation: a full
    // sentence identical in both files.
    const identical = Object.entries(fr).filter(
      ([key, value]) => value === pt[key as keyof typeof pt] && value.split(' ').length > 4,
    );
    expect(identical).toEqual([]);
  });

  it('carries every {placeholder} the pt-BR string uses, spelled the same way', () => {
    const placeholdersIn = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

    for (const [key, ptValue] of Object.entries(pt)) {
      const frValue = fr[key as keyof typeof fr];
      expect(placeholdersIn(frValue), `fr['${key}'] placeholders`).toEqual(placeholdersIn(ptValue));
    }
  });
});
