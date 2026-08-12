/**
 * Concatenates every migration — in filename order — into one script that can
 * be pasted into the Supabase SQL editor in a single run.
 *
 * `supabase db push` is the normal route and does this ordering for you. This
 * exists for the case where the CLI cannot be linked (no interactive login
 * available) and the dashboard is the only way in: pasting the files one by one
 * is where the ordering mistakes happen, because migration 01 already depends on
 * the enums created by migration 00.
 *
 * Pass `--seed` to append the demo data.
 *
 * The bundle is validated against a throwaway Postgres before being written, so
 * a file that would fail halfway through the editor never gets produced.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

import { root, SUPABASE_STUBS } from './build-schema.mjs';

const withSeed = process.argv.includes('--seed');

const migrationsDir = path.join(root, 'supabase', 'migrations');
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

const parts = [
  `-- ============================================================================`,
  `-- Meu Petit Chef — todas as migrações, na ordem, em um único script.`,
  `-- Gerado por scripts/bundle-migrations.mjs — não edite à mão.`,
  `-- ${files.length} migrações${withSeed ? ' + seed' : ''}.`,
  `-- ============================================================================`,
  '',
];

for (const file of files) {
  parts.push(`-- ─── ${file} ${'─'.repeat(Math.max(0, 60 - file.length))}`);
  parts.push(await readFile(path.join(migrationsDir, file), 'utf8'));
  parts.push('');
}

if (withSeed) {
  parts.push(`-- ─── seed.sql ${'─'.repeat(52)}`);
  parts.push(await readFile(path.join(root, 'supabase', 'seed.sql'), 'utf8'));
  parts.push('');
}

const bundle = parts.join('\n');

// Validate: the bundle has to survive as one statement batch, not just as the
// individual files the regular verify already covers.
const db = await PGlite.create({ extensions: { pg_trgm, unaccent, pgcrypto } });
await db.exec(SUPABASE_STUBS);
await db.exec(bundle);

const { rows } = await db.query(
  `select count(*)::int as tables from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
);
await db.close();

const outDir = path.join(root, 'supabase', '.temp');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, withSeed ? 'all-migrations-seed.sql' : 'all-migrations.sql');
await writeFile(outFile, bundle, 'utf8');

console.log(`✔ bundle applies cleanly — ${rows[0].tables} tables in public`);
console.log(`· ${path.relative(root, outFile)} (${(bundle.length / 1024).toFixed(0)} KB)`);
