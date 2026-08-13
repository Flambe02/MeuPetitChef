/**
 * Gives a Pexels photo to every existing personal recipe that has none.
 *
 *   npm run recipe:backfill-photos -- --dry-run
 *   npm run recipe:backfill-photos -- --limit 20
 *   npm run recipe:backfill-photos -- --all
 *
 * Only `generate-recipe` (chat) and imports without a source image write
 * `photo_url` going forward — this is the one-off catch-up for recipes
 * created before that existed. Scoped to `status = 'draft'` with neither
 * `photo_url` nor `hero_image_path` set: the published catalogue keeps using
 * its own bucket on purpose (see migration 16), and a recipe that already has
 * a picture is left alone. Running it twice is safe — anything already
 * photographed is no longer in the query.
 */
import { parseArgs } from 'node:util';

import { createImportClient, type ImportClient } from './runtime/supabase.ts';
import { requireEnv } from './runtime/env.ts';
import { createLogger } from './runtime/log.ts';

const DEFAULT_DELAY_MS = 500;

const USAGE = `
Uso:
  npm run recipe:backfill-photos -- [--limit <n> | --all | --recipe <uuid>]

Opções:
  --limit <n>      No máximo n receitas (padrão 20)
  --all            Todas as receitas sem foto
  --recipe <uuid>  Uma receita específica
  --delay <ms>     Espera entre chamadas ao Pexels (padrão ${DEFAULT_DELAY_MS})
  --dry-run        Mostra o que seria buscado, sem chamar o Pexels nem gravar
  --help
`.trim();

interface Candidate {
  id: string;
  title: string;
}

async function candidates(client: ImportClient): Promise<Candidate[]> {
  const { data, error } = await client
    .from('recipes')
    .select('id, title')
    .eq('status', 'draft')
    .is('photo_url', null)
    .is('hero_image_path', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Não foi possível listar as receitas: ${error.message}`);
  return data;
}

/** Same query shape as the `recipe-image` Edge Function, called directly here — a
 *  service-role script does not need to go through a user-authenticated call. */
async function searchPexels(pexelsKey: string, title: string): Promise<string | null> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(`${title} food dish`)}&per_page=1&orientation=landscape`;
  const response = await fetch(url, { headers: { Authorization: pexelsKey } });
  if (!response.ok) throw new Error(`Pexels respondeu ${response.status}`);

  const data = (await response.json()) as { photos?: { src: { large: string } }[] };
  return data.photos?.[0]?.src.large ?? null;
}

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
  const pexelsKey = requireEnv('PEXELS_API_KEY', 'buscar fotos no Pexels');
  const delayMs = Math.max(0, Number(values.delay ?? DEFAULT_DELAY_MS));

  const queue = values.recipe
    ? [{ id: values.recipe, title: '(receita indicada)' }]
    : (await candidates(client)).slice(
        0,
        values.all ? Number.POSITIVE_INFINITY : Number(values.limit ?? 20),
      );

  console.log(`${queue.length} receita(s) sem foto${values['dry-run'] ? ' (simulação)' : ''}`);
  console.log('');

  if (values['dry-run']) {
    for (const recipe of queue) console.log(`  ${recipe.id}  ${recipe.title}`);
    return 0;
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, recipe] of queue.entries()) {
    const position = `${String(index + 1).padStart(String(queue.length).length)}/${queue.length}`;
    try {
      const photoUrl = await searchPexels(pexelsKey, recipe.title);
      if (!photoUrl) {
        skipped += 1;
        console.log(`${position} SEM FOTO  ${recipe.title}`);
      } else {
        const { error } = await client
          .from('recipes')
          .update({ photo_url: photoUrl })
          .eq('id', recipe.id)
          .select('id');
        if (error) throw new Error(error.message);
        done += 1;
        console.log(`${position} OK        ${recipe.title} → ${photoUrl}`);
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${position} FALHOU    ${recipe.title}`);
      logger.error('backfill-photos', `${recipe.id}: ${message}`);
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log('');
  console.log(`Com foto agora: ${done} · sem resultado: ${skipped} · falhas: ${failed}`);
  return failed > 0 ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`[ERROR]    stage=backfill-photos message=${JSON.stringify(String(error))}`);
  process.exitCode = 1;
}
