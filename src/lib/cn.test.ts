import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  /**
   * The regression this file exists for: every primary button in the app was
   * rendering black text on a graphite background, because tailwind-merge filed
   * `text-body` as a colour and dropped the colour that came before it.
   */
  it('keeps a text colour and a font size together', () => {
    const merged = cn('bg-graphite-900 text-porcelain-100', 'h-[50px] px-6 text-body');
    expect(merged).toContain('text-porcelain-100');
    expect(merged).toContain('text-body');
  });

  it('still resolves two colours, and two sizes, in favour of the last', () => {
    expect(cn('text-ink', 'text-rouge')).toBe('text-rouge');
    expect(cn('text-body', 'text-small')).toBe('text-small');
  });

  it('leaves the built-in conflicts alone', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', 'text-ink')).toBe('text-sm text-ink');
  });
});
