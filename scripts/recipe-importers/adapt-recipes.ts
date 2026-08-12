/**
 * Adapt imported drafts to Brazil, in bulk.
 *
 *   npm run recipe:adapt -- --limit 10          # essai
 *   npm run recipe:adapt -- --all
 *   npm run recipe:adapt -- --recipe <uuid>
 *
 * Picks up every recipe that was imported (`source_provider is not null`), is
 * still a draft, and has no `rewrite` row in `adaptation_logs` yet. Running it
 * twice is therefore safe: what is already adapted is skipped.
 *
 * Each recipe costs an LLM call, so `--limit` is the default posture and
 * `--all` has to be asked for.
 */
import { parseArgs } from 'node:util';

import { adaptWithRetry, type AdaptationResult } from '../../src/lib/recipe-import/adapt.ts';
import { applyAdaptation, readForAdaptation } from '../../src/lib/recipe-import/adapt-persist.ts';
import type { AdaptationRequest } from '../../src/lib/recipe-import/adapt.ts';
import { createImportClient, importUserId, type ImportClient } from './runtime/supabase.ts';
import { readEnv, requireEnv } from './runtime/env.ts';
import { createLogger } from './runtime/log.ts';

/**
 * Calls the Edge Function with a plain `fetch` rather than
 * `supabase.functions.invoke`.
 *
 * `invoke` rides on the Supabase client, which also sends an `apikey` header —
 * and the gateway then rewrites `Authorization`, so the function sees a
 * credential the caller never sent and answers 401. A direct request sends
 * exactly what we mean to send.
 *
 * Two credentials go out, and either is enough: the shared `x-import-token`
 * (the robust path, once the function has been redeployed with it) and the
 * service key (what the currently deployed version matches on).
 */
async function callAdaptFunction(
  request: AdaptationRequest,
): Promise<{ adapted: AdaptationResult; model?: string }> {
  const url = readEnv('SUPABASE_URL') ?? requireEnv('VITE_SUPABASE_URL', 'a URL do projeto');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY', 'chamar a Edge Function');
  const importToken = readEnv('RECIPE_ADAPT_TOKEN');

  const response = await fetch(`${url}/functions/v1/adapt-recipe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(importToken ? { 'x-import-token': importToken } : {}),
    },
    body: JSON.stringify({ recipe: request }),
  });

  const text = await response.text();
  if (!response.ok) {
    // Surfacing the body matters: without it every failure reads "non-2xx".
    throw new Error(`Edge Function respondeu ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text) as { adapted?: AdaptationResult; model?: string; error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.adapted) throw new Error('Resposta vazia da adaptação.');
  return { adapted: data.adapted, model: data.model };
}

const DEFAULT_DELAY_MS = 500;

const USAGE = `
Uso:
  npm run recipe:adapt -- [--limit <n> | --all | --recipe <uuid>]

Opções:
  --limit <n>      Adapta no máximo n receitas (padrão 5)
  --all            Adapta todas as receitas importadas ainda não adaptadas
  --recipe <uuid>  Adapta uma receita específica
  --delay <ms>     Espera entre chamadas (padrão ${DEFAULT_DELAY_MS})
  --dry-run        Mostra o que seria adaptado, sem chamar nem gravar
  --help
`.trim();

/** Imported drafts that no `rewrite` log points at yet. */
async function pendingRecipes(client: ImportClient): Promise<{ id: string; title: string }[]> {
  const { data: recipes, error } = await client
    .from('recipes')
    .select('id, title')
    .not('source_provider', 'is', null)
    .eq('status', 'draft')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Não foi possível listar as receitas: ${error.message}`);

  const { data: logs, error: logError } = await client
    .from('adaptation_logs')
    .select('recipe_id')
    .eq('kind', 'rewrite');
  if (logError) throw new Error(`Não foi possível ler o histórico: ${logError.message}`);

  // Filtered here rather than in the query: PostgREST has no NOT EXISTS, and a
  // catalogue of a few thousand rows fits in memory comfortably.
  const adapted = new Set(logs.map((row) => row.recipe_id));
  return recipes.filter((recipe) => !adapted.has(recipe.id));
}

async function adaptOne(
  client: ImportClient,
  recipeId: string,
  userId: string | null,
): Promise<{ title: string; warnings: number; attempts: number }> {
  const source = await readForAdaptation(client, recipeId);

  // Sanitises, verifies, and asks again when the answer does not hold up.
  // Nothing is written unless a rewrite passes: a recipe that reads well and
  // cooks wrong is the one failure mode worth refusing outright.
  const { result, validation, model, attempts } = await adaptWithRetry(
    source.request,
    callAdaptFunction,
  );

  await applyAdaptation(client, {
    source,
    result,
    validation,
    userId,
    model: model ?? 'desconhecido',
  });

  return { title: result.title, warnings: validation.warnings.length, attempts };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      limit: { type: 'string' },
      all: { type: 'boolean', default: false },
      recipe: { type: 'string' },
      delay: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const logger = createLogger();
  const client = createImportClient();
  const userId = importUserId();
  const delayMs = Math.max(0, Number(values.delay ?? DEFAULT_DELAY_MS));

  const queue = values.recipe
    ? [{ id: values.recipe, title: '(receita indicada)' }]
    : (await pendingRecipes(client)).slice(
        0,
        values.all ? Number.POSITIVE_INFINITY : Number(values.limit ?? 5),
      );

  console.log(`${queue.length} receita(s) a adaptar${values['dry-run'] ? ' (simulação)' : ''}`);
  console.log('');

  if (values['dry-run']) {
    for (const recipe of queue) console.log(`  ${recipe.id}  ${recipe.title}`);
    return 0;
  }

  let done = 0;
  let failed = 0;

  for (const [index, recipe] of queue.entries()) {
    try {
      const result = await adaptOne(client, recipe.id, userId);
      done += 1;
      console.log(
        `${String(index + 1).padStart(String(queue.length).length)}/${queue.length} ` +
          `OK        ${recipe.title} → ${result.title}` +
          (result.warnings > 0 ? `  (${result.warnings} substituição(ões))` : '') +
          (result.attempts > 1 ? `  [${result.attempts} tentativas]` : ''),
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `${String(index + 1).padStart(String(queue.length).length)}/${queue.length} ` +
          `FALHOU    ${recipe.title}`,
      );
      logger.error('adapt', `${recipe.id}: ${message}`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  console.log('');
  console.log(`Adaptadas: ${done} · falhas: ${failed}`);
  return failed > 0 ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`[ERROR]    stage=adapt message=${JSON.stringify(String(error))}`);
  process.exitCode = 1;
}
