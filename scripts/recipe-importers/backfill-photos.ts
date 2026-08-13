/**
 * Gives a Pexels photo to every existing recipe that has none.
 *
 *   npm run recipe:backfill-photos -- --dry-run
 *   npm run recipe:backfill-photos -- --limit 20
 *   npm run recipe:backfill-photos -- --all
 *
 * Mirrors the `recipe-image` Edge Function's search — title→English-phrase
 * translation via OpenAI, then Pexels — rather than calling the function
 * itself: it authenticates callers against a real user session, which a
 * service-role script does not have.
 *
 * Covers every status, not just drafts: migration 16 says the published
 * catalogue should use `hero_image_path` (its own bucket), but the actual
 * seed data mostly has neither — a photo from Pexels beats no photo. A
 * recipe that already has one, even a rotted link, is left alone; null its
 * `photo_url` first if it needs a fresh search.
 */
import { parseArgs } from 'node:util';

import { createImportClient, type ImportClient } from './runtime/supabase.ts';
import { readEnv, requireEnv } from './runtime/env.ts';
import { createLogger } from './runtime/log.ts';

const DEFAULT_DELAY_MS = 300;

const USAGE = `
Uso:
  npm run recipe:backfill-photos -- [--limit <n> | --all | --recipe <uuid>]

Opções:
  --limit <n>      No máximo n receitas (padrão 20)
  --all            Todas as receitas sem foto
  --recipe <uuid>  Uma receita específica
  --delay <ms>     Espera entre chamadas (padrão ${DEFAULT_DELAY_MS})
  --dry-run        Mostra o que seria buscado, sem chamar nem gravar
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
    .is('photo_url', null)
    .is('hero_image_path', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Não foi possível listar as receitas: ${error.message}`);
  return data;
}

/** Same prompt as `toSearchPhrase` in the Edge Function — keep the two in step. */
async function toSearchPhrase(openaiKey: string, title: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Turn a recipe title (Portuguese or French) into a short English stock-photo search phrase: 3 to 6 words, a plain visual description of the finished dish on a plate, naming its distinguishing ingredients. No quotes, no recipe jargon, no brand names. ' +
            'Examples — "Omelete de Batata" -> potato omelette on a plate. ' +
            '"Steak Haché com Fritas de Batata Doce" -> beef patty with sweet potato fries, no bun. ' +
            '"Poulet basquaise" -> basque chicken stew with peppers.',
        },
        { role: 'user', content: title },
      ],
      max_tokens: 20,
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI respondeu ${response.status}`);

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const phrase = data.choices?.[0]?.message?.content?.trim();
  if (!phrase) throw new Error('Resposta vazia.');
  return phrase;
}

async function searchPexels(
  pexelsKey: string,
  openaiKey: string | null,
  title: string,
): Promise<string | null> {
  let phrase = `${title} food dish`;
  if (openaiKey) {
    try {
      phrase = await toSearchPhrase(openaiKey, title);
    } catch (error) {
      console.error(`  (tradução falhou, usando o título: ${String(error)})`);
    }
  }

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(phrase)}&per_page=1&orientation=landscape`;
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
  const openaiKey = readEnv('OPENAI_API_KEY');
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
      const photoUrl = await searchPexels(pexelsKey, openaiKey, recipe.title);
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
