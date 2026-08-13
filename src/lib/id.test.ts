import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomId } from './id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('randomId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    expect(randomId()).toMatch(UUID_PATTERN);
  });

  it('falls back to crypto.getRandomValues when randomUUID is missing', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const id = randomId();
    expect(id).toMatch(UUID_PATTERN);
  });

  it('falls back to Math.random when crypto is entirely unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const id = randomId();
    expect(id).toMatch(UUID_PATTERN);
  });

  it('never repeats across a few thousand calls', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => randomId()));
    expect(ids.size).toBe(5000);
  });
});
