import { describe, expect, it } from 'vitest';

import { asset } from './asset';

describe('asset', () => {
  it('hangs a public file off the app base', () => {
    // BASE_URL is `/` under Vitest, which is exactly the case that hides the bug.
    expect(asset('brand/badge.png')).toBe('/brand/badge.png');
  });

  it('tolerates a leading slash without doubling it', () => {
    expect(asset('/brand/badge.png')).toBe('/brand/badge.png');
  });
});

/* ---------------------------------------------------------------------------
 * The regression guard.
 *
 * `<img src="/brand/badge.png" />` works in development and 404s on GitHub
 * Pages, where the app is served from `/MeuPetitChef/`. Vite rewrites the paths
 * it can see — `index.html`, anything imported — but a string literal in JSX is
 * opaque to it, so nothing warns. The logo simply disappears in production.
 *
 * This scans the source for that shape. It is a blunt instrument, and that is
 * the point: the failure it prevents is invisible in every local check.
 * ------------------------------------------------------------------------- */

const SOURCES: Record<string, string> = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** `public/` at the repository root — what an absolute path would point at. */
const PUBLIC_DIRS = ['brand', 'chefs', 'pwa-', 'favicon', 'apple-touch-icon', 'maskable-icon'];

describe('public assets', () => {
  it('are never referenced by an absolute path', () => {
    const offenders: string[] = [];

    for (const [file, source] of Object.entries(SOURCES)) {
      // The helper and this test both quote the broken shape on purpose, to
      // explain it. Vite normalises glob keys, so match on the file name.
      if (/asset(\.test)?\.ts$/.test(file)) continue;

      for (const match of source.matchAll(
        /["'`](\/[\w./-]+\.(?:png|jpg|jpeg|svg|ico|webp))["'`]/g,
      )) {
        const path = match[1] ?? '';
        if (PUBLIC_DIRS.some((dir) => path.startsWith(`/${dir}`))) {
          offenders.push(`${file}: ${path}`);
        }
      }
    }

    expect(
      offenders,
      `Ces chemins cassent dès que l'app n'est pas servie à la racine.\n` +
        `Utilisez asset('…') de src/lib/asset.ts :\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
