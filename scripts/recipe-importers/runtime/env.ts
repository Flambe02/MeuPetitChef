/**
 * Environment for the import scripts.
 *
 * Vite loads `.env.local` for the browser bundle; Node does not, and the
 * importers need the same file (that is where the Supabase keys already live).
 * Reading it here avoids a dotenv dependency for twenty lines of parsing.
 *
 * Only `VITE_`-prefixed variables ever reach the browser bundle, so a
 * `SUPABASE_SERVICE_ROLE_KEY` sitting in `.env.local` is server-side only —
 * and `.env.local` is gitignored. No secret is ever written to the repository.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

/** Existing process env always wins, so `KEY=… npm run …` still overrides. */
function loadFile(file: string): void {
  let contents: string;
  try {
    contents = readFileSync(path.join(repoRoot, file), 'utf8');
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;
    const key = match[1];
    if (key in process.env) continue;

    let value = (match[2] ?? '').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    process.env[key] = value;
  }
}

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  // `.env.local` first: it is the one a developer actually fills in.
  loadFile('.env.local');
  loadFile('.env');
}

export function readEnv(key: string): string | null {
  loadEnv();
  const value = process.env[key];
  return value && value.length > 0 ? value : null;
}

export function requireEnv(key: string, why: string): string {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`Falta a variável de ambiente ${key} — ${why}. Veja .env.example.`);
  }
  return value;
}
