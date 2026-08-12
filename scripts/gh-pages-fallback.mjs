/**
 * Makes a Vite build survivable on GitHub Pages.
 *
 * Pages serves static files and nothing else — there is no rewrite rule, so a
 * request for `/MeuPetitChef/receita/lasanha` looks for a directory that does
 * not exist and gets the 404 page. That breaks every shared link, every
 * bookmark and every F5 outside the home screen.
 *
 * The standard answer is to serve the app itself as the 404 page: Pages
 * returns `404.html`, the SPA boots, react-router reads the URL it was asked
 * for and renders the right screen. The status code stays 404, which is
 * cosmetically wrong but invisible to the user and harmless to crawlers of a
 * private app.
 *
 * `.nojekyll` stops Pages running the output through Jekyll, which would
 * silently drop any file or directory whose name starts with an underscore.
 *
 * Usage: npm run build:pages
 */
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await copyFile(path.join(dist, 'index.html'), path.join(dist, '404.html'));
await writeFile(path.join(dist, '.nojekyll'), '', 'utf8');

console.log('· dist/404.html   (repli SPA)');
console.log('· dist/.nojekyll  (pas de traitement Jekyll)');
