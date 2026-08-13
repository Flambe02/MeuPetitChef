/**
 * Generates the PWA icon set from the brand logo.
 *
 * The maskable icon gets a porcelain background and 20% safe-area padding —
 * Android crops maskable icons to a circle or squircle, and a logo that bleeds
 * to the edge comes out decapitated on the home screen.
 *
 * Usage: npm run icons
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const PORCELAIN = { r: 0xf5, g: 0xf3, b: 0xee, alpha: 1 };

// `public/brand/badge.png` is the Capivara mark itself — a face cropped
// tight to its own circular frame — which is what an app icon needs. The
// files under the root `brand/` folder are full presentation sheets (logo +
// wordmark + chef-mode gallery); running those through `fit: 'contain'`
// produces an unreadable icon, which is exactly the bug this script used to
// have.
const source = path.join(publicDir, 'brand', 'badge.png');
await mkdir(publicDir, { recursive: true });
console.log(`· source ${path.relative(root, source)}`);

const square = (size) =>
  sharp(source)
    .resize(size, size, { fit: 'contain', background: PORCELAIN })
    .flatten({ background: PORCELAIN })
    .png();

await square(192).toFile(path.join(publicDir, 'pwa-192.png'));
await square(512).toFile(path.join(publicDir, 'pwa-512.png'));
await square(180).toFile(path.join(publicDir, 'apple-touch-icon.png'));

// Maskable: the logo occupies the inner 60%, leaving the crop margin Android wants.
const inner = Math.round(512 * 0.6);
const logo = await sharp(source)
  .resize(inner, inner, { fit: 'contain', background: { ...PORCELAIN, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: { width: 512, height: 512, channels: 4, background: PORCELAIN },
})
  .composite([{ input: logo, gravity: 'centre' }])
  .png()
  .toFile(path.join(publicDir, 'maskable-icon-512.png'));

// A 32px PNG named .ico is accepted by every browser that still asks for one.
await square(32).toFile(path.join(publicDir, 'favicon.ico'));

console.log('· wrote pwa-192, pwa-512, apple-touch-icon, maskable-icon-512, favicon.ico');
