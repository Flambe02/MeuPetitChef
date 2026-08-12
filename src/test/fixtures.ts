/**
 * Recorded pages from `tests/fixtures/`, for the importer tests.
 *
 * The importer tests must never touch the live sites: a parser test that fails
 * because Cookomix is down tells you nothing, and hammering someone's server on
 * every `npm test` is exactly the behaviour this feature is careful to avoid.
 *
 * Loaded through Vite's `?raw` rather than `node:fs` so the helper stays inside
 * the browser-typed project — the app's tsconfig deliberately has no Node types.
 */
const FILES: Record<string, string> = import.meta.glob('../../tests/fixtures/**/*.{html,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export function readFixture(...segments: string[]): string {
  const key = `../../tests/fixtures/${segments.join('/')}`;
  const contents = FILES[key];
  if (contents === undefined) {
    throw new Error(
      `Fixture inexistante : ${segments.join('/')}. Connues : ${Object.keys(FILES).join(', ')}`,
    );
  }
  return contents;
}

/** The same fixture, parsed. jsdom supplies `DOMParser` in the test env. */
export function readFixtureDocument(...segments: string[]): Document {
  return new DOMParser().parseFromString(readFixture(...segments), 'text/html');
}
