/**
 * Import a list of recipes, slowly and resumably.
 *
 *   npm run recipe:import-batch -- --input urls.txt --provider cookomix
 *   npm run recipe:import-batch -- --input urls.txt --save --delay 4000
 *
 * The defaults are deliberately timid — one request at a time, three seconds
 * between them — because the point of this script is to be a guest on someone
 * else's server. Every URL's outcome is appended to a journal, so an
 * interrupted run picks up where it stopped instead of re-fetching everything.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import type { ProviderId } from '../../src/lib/recipe-import/types.ts';
import { providerIds } from '../../src/lib/recipe-import/registry.ts';
import { createLogger } from './runtime/log.ts';
import { importOne } from './runtime/pipeline.ts';
import { FetchRefused } from './runtime/fetcher.ts';
import { batchLine } from './runtime/report.ts';
import { createImportClient, type ImportClient } from './runtime/supabase.ts';

/** Anything above this stops being "a few pages" and starts being a crawl. */
const MAX_CONCURRENCY = 3;
const DEFAULT_DELAY_MS = 3000;

const USAGE = `
Uso:
  npm run recipe:import-batch -- --input <arquivo.txt> [opções]

O arquivo tem uma URL por linha; linhas vazias e começadas por # são ignoradas.

Opções:
  --provider <id>     Força o provedor para todas as URLs
  --save              Grava no Supabase (por padrão só valida)
  --force             Grava mesmo em caso de duplicata
  --delay <ms>        Espera entre requisições (padrão ${DEFAULT_DELAY_MS})
  --concurrency <n>   Requisições simultâneas (padrão 1, máximo ${MAX_CONCURRENCY})
  --state <caminho>   Diário de execução (padrão .recipe-imports/<arquivo>.jsonl)
  --restart           Ignora o diário e refaz tudo
  --limit <n>         Processa no máximo n URLs
  --help
`.trim();

interface JournalEntry {
  url: string;
  state: string;
  detail?: string;
  at: string;
}

async function readUrls(file: string): Promise<string[]> {
  const contents = await readFile(file, 'utf8');
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** URLs already dealt with, so a resumed run skips them. */
async function readJournal(file: string): Promise<Map<string, JournalEntry>> {
  const done = new Map<string, JournalEntry>();
  let contents: string;
  try {
    contents = await readFile(file, 'utf8');
  } catch {
    return done;
  }
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as JournalEntry;
      // A transient failure should be retried on the next run; a decision
      // (saved, duplicate, skipped, needs review) should not.
      if (entry.state !== 'ERROR') done.set(entry.url, entry);
    } catch {
      // A truncated last line is expected after a hard interrupt.
    }
  }
  return done;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: 'string' },
      provider: { type: 'string' },
      save: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      delay: { type: 'string' },
      concurrency: { type: 'string' },
      state: { type: 'string' },
      restart: { type: 'boolean', default: false },
      limit: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help || !values.input) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const provider = values.provider as ProviderId | undefined;
  if (provider && !providerIds().includes(provider)) {
    console.error(`Provedor desconhecido: ${provider}. Conhecidos: ${providerIds().join(', ')}`);
    return 1;
  }

  const delayMs = Math.max(0, Number(values.delay ?? DEFAULT_DELAY_MS));
  const requested = Math.max(1, Number(values.concurrency ?? 1));
  const concurrency = Math.min(MAX_CONCURRENCY, requested);
  if (requested > MAX_CONCURRENCY) {
    console.warn(`Concorrência limitada a ${MAX_CONCURRENCY} (pedido: ${requested}).`);
  }

  const statePath =
    values.state ??
    path.join('.recipe-imports', `${path.basename(values.input).replace(/\.\w+$/, '')}.jsonl`);
  await mkdir(path.dirname(statePath), { recursive: true });

  const all = await readUrls(values.input);
  const done = values.restart ? new Map<string, JournalEntry>() : await readJournal(statePath);
  const limit = values.limit ? Number(values.limit) : Number.POSITIVE_INFINITY;

  const queue = all.filter((url) => !done.has(url)).slice(0, limit);

  console.log(`${all.length} URLs · ${done.size} já processadas · ${queue.length} nesta execução`);
  console.log(`concorrência=${concurrency} atraso=${delayMs}ms diário=${statePath}`);
  console.log('');

  // One client for the whole run: each `importOne` creating its own would open
  // a connection pool per URL.
  const client: ImportClient | null = values.save ? createImportClient() : null;
  const logger = createLogger({ quiet: true });

  const counters: Record<string, number> = {};
  let cursor = 0;

  const record = async (url: string, state: string, detail?: string) => {
    counters[state] = (counters[state] ?? 0) + 1;
    const entry: JournalEntry = {
      url,
      state,
      ...(detail === undefined ? {} : { detail }),
      at: new Date().toISOString(),
    };
    await appendFile(statePath, `${JSON.stringify(entry)}\n`, 'utf8');
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const url = queue[index];
      if (url === undefined) return;

      try {
        const result = await importOne({
          url,
          provider: provider ?? null,
          save: values.save,
          force: values.force,
          logger,
          client,
          fetchOptions: { delayMs },
        });

        const detail = result.savedRecipe?.slug ?? result.outcome.recipe.title;
        console.log(batchLine(index, queue.length, url, result.state, detail));
        await record(url, result.state, detail);
      } catch (error) {
        const refused = error instanceof FetchRefused;
        const state = refused ? 'SKIPPED' : 'ERROR';
        const message = error instanceof Error ? error.message : String(error);
        console.log(batchLine(index, queue.length, url, state, message));
        console.error(`[ERROR]    stage=batch url=${url} message=${JSON.stringify(message)}`);
        await record(url, state, message);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log('');
  console.log('Resumo:');
  for (const [state, count] of Object.entries(counters).sort()) {
    console.log(`  ${state.padEnd(18)} ${count}`);
  }
  console.log(`  diário             ${statePath}`);
  console.log('');

  return (counters.ERROR ?? 0) > 0 ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`[ERROR]    stage=batch message=${JSON.stringify(String(error))}`);
  process.exitCode = 1;
}
