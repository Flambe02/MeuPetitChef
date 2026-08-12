/**
 * HTML → `Document`, the Node half of the pair.
 *
 * The import core walks a DOM but never creates one: the browser has
 * `DOMParser` and Node has jsdom, and a core that imported jsdom could not be
 * bundled into the app. So each runtime supplies its own factory and the
 * parsers stay identical.
 *
 * jsdom is already a devDependency (Vitest uses it), so this costs nothing.
 */
import { JSDOM } from 'jsdom';

/**
 * Scripts are never executed and resources are never loaded: we want the
 * markup the server sent, and running a page's JavaScript in the importer
 * would be both slow and a needless attack surface.
 */
export function parseHtml(html: string): Document {
  return new JSDOM(html, { runScripts: 'outside-only', resources: undefined }).window
    .document as unknown as Document;
}
