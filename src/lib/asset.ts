/**
 * URL of a file shipped in `public/`.
 *
 * Vite rewrites the asset paths it can see — the ones in `index.html`, and
 * anything reached through an `import` — but a string literal in JSX is opaque
 * to it. `<img src="/brand/badge.png" />` therefore stays exactly that, which
 * is correct at a domain root and a 404 everywhere else.
 *
 * That distinction is invisible in development, where the base is `/` and both
 * spellings work. It only shows up in production, as a missing logo.
 *
 * So: every reference to a file in `public/` goes through here.
 */
export function asset(path: string): string {
  // BASE_URL always ends with a slash; the leading one on `path` would make a
  // double slash, which some hosts serve and others do not.
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
