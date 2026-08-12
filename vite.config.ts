/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const APP_NAME = 'Meu Petit Chef';

/**
 * Where the app is served from.
 *
 * `/` in development and on any host that serves the app at a domain root.
 * GitHub Pages serves a project site from `/<repo>/`, so the workflow sets
 * `VITE_BASE_PATH=/MeuPetitChef/` — and everything that hardcodes a leading
 * slash has to follow: the PWA manifest, the service worker's fallback, the
 * router's basename and the auth redirect. Get one of them wrong and the app
 * either 404s on its own assets or silently leaves its own scope.
 *
 * Always ends with a slash, which is what Vite exposes as `import.meta.env.BASE_URL`.
 */
function normalizeBase(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === '/') return '/';
  // Accepts `MeuPetitChef`, `/MeuPetitChef` and `/MeuPetitChef/` alike — a
  // missing slash at either end is the easiest thing in the world to get
  // wrong, and it breaks every asset URL in the build.
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

const BASE = normalizeBase(process.env.VITE_BASE_PATH);

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'brand/*.png'],
      manifest: {
        id: BASE,
        name: APP_NAME,
        short_name: 'Petit Chef',
        description:
          'Receitas que se adaptam aos seus equipamentos, aos seus objetivos e às suas porções.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        // Deliberately unlocked. Sixteen of the eighteen screens are portrait,
        // but cook mode and the recipe spread are designed landscape — the
        // prototype gates its own frame on `screen !== "cook" && !== "spread"`.
        // Declaring `portrait` here locks an installed PWA on Android and makes
        // those two screens unreachable in the orientation they were drawn for.
        orientation: 'any',
        background_color: '#F5F3EE',
        theme_color: '#0B0D10',
        categories: ['food', 'lifestyle', 'health'],
        icons: [
          { src: `${BASE}pwa-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}pwa-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${BASE}maskable-icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Sugestões de hoje',
            url: `${BASE}sugestoes`,
            description: 'O que cozinhar agora',
          },
          { name: 'Minhas receitas', url: `${BASE}favoritos`, description: 'Favoritos e coleções' },
          { name: 'Lista de compras', url: `${BASE}compras`, description: 'O que falta comprar' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,ico}'],
        // The cook screen must survive a dropped connection mid-recipe.
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Recipe photos in Supabase Storage: show instantly, refresh in background.
            urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'mpc-recipe-images',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Webfonts (Fontshare + Google Fonts) are immutable — cache hard.
            urlPattern: ({ url }) =>
              url.hostname === 'cdn.fontshare.com' ||
              url.hostname === 'fonts.googleapis.com' ||
              url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'mpc-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the three heavy, rarely-changing dependencies out of the app
        // bundle so a code change does not invalidate them in the cache.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router)[\\/]/.test(id)) return 'react';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@tanstack')) return 'query';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
    },
  },
});
