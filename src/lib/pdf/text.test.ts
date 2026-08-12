import { describe, expect, it } from 'vitest';

import { dataUrlToBlob, joinTextItems } from './text';

/**
 * Everything else in this module needs a real `<canvas>` and a real pdf.js
 * worker, which jsdom does not provide — see the file's own header. These two
 * functions are pure enough to test without either.
 */
describe('joinTextItems', () => {
  it('turns hasEOL into a line break and everything else into a space', () => {
    const text = joinTextItems([
      { str: 'GASPACHO DE TOMATE', hasEOL: true },
      { str: 'Pour', hasEOL: false },
      { str: '4', hasEOL: false },
      { str: 'personnes', hasEOL: true },
    ]);
    expect(text).toBe('GASPACHO DE TOMATE\nPour 4 personnes\n');
  });

  it('returns an empty string for a page with no text layer', () => {
    expect(joinTextItems([])).toBe('');
  });
});

describe('dataUrlToBlob', () => {
  it('recovers the mime type and the byte length', async () => {
    // "hi" in base64.
    const blob = dataUrlToBlob('data:image/jpeg;base64,aGk=');
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(2);
    expect(await blob.text()).toBe('hi');
  });
});
