/**
 * Import one recipe.
 *
 *   npm run recipe:import -- "https://www.cookomix.com/recettes/…/"
 *   npm run recipe:import -- --provider cookidoo --file ./recipe.html
 *   npm run recipe:import -- --provider cookidoo --file ./recipe.json
 *   npm run recipe:import -- "https://…" --save
 *   npm run recipe:import -- "https://…" --json --out ./receita.json
 *
 * Nothing is written to the database without `--save`. The provider is detected
 * from the URL; `--provider` forces it, and is required with `--file`.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import type { ProviderId } from '../../src/lib/recipe-import/types.ts';
import { providerIds } from '../../src/lib/recipe-import/registry.ts';
import { createLogger } from './runtime/log.ts';
import { importOne } from './runtime/pipeline.ts';
import { FetchRefused } from './runtime/fetcher.ts';
import { printReport } from './runtime/report.ts';

const USAGE = `
Uso:
  npm run recipe:import -- <url> [opções]
  npm run recipe:import -- --provider <${providerIds().join('|')}> --file <arquivo> [opções]

Opções:
  --provider <id>   Força o provedor (obrigatório com --file)
  --file <caminho>  Lê um HTML salvo ou um JSON em vez de buscar na rede
  --save            Grava no Supabase (por padrão só mostra a prévia)
  --force           Grava mesmo se já existir um import igual
  --servings <n>    Sobrescreve o número de porções
  --json            Imprime a receita canônica em JSON
  --out <caminho>   Escreve o JSON em um arquivo
  --raw             Com --json, imprime também o payload bruto da fonte
  --quiet           Só erros
  --help
`.trim();

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      provider: { type: 'string' },
      file: { type: 'string' },
      save: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      servings: { type: 'string' },
      json: { type: 'boolean', default: false },
      out: { type: 'string' },
      raw: { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help || (positionals.length === 0 && !values.file)) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const url = positionals[0] ?? null;
  const provider = values.provider as ProviderId | undefined;

  if (provider && !providerIds().includes(provider)) {
    console.error(`Provedor desconhecido: ${provider}. Conhecidos: ${providerIds().join(', ')}`);
    return 1;
  }
  if (values.file && !provider) {
    console.error('--file exige --provider: um arquivo local não diz de onde veio.');
    return 1;
  }

  const servings = values.servings ? Number(values.servings) : undefined;
  if (servings !== undefined && (!Number.isFinite(servings) || servings < 1)) {
    console.error('--servings precisa ser um número maior que zero.');
    return 1;
  }

  // JSON on stdout must stay parseable, so the stage log steps aside for it.
  const logger = createLogger({ quiet: values.quiet || values.json });

  const result = await importOne({
    url,
    file: values.file ?? null,
    provider: provider ?? null,
    servings,
    save: values.save,
    force: values.force,
    logger,
    fetchOptions: { delayMs: 0 },
  });

  const payload = values.raw
    ? {
        recipe: result.outcome.recipe,
        raw: result.outcome.raw,
        validation: result.outcome.validation,
      }
    : result.outcome.recipe;

  if (values.out) {
    await writeFile(values.out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  if (values.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printReport(result.outcome, result.state);

    if (result.duplicate) {
      const { reason, recipeId } = result.duplicate;
      console.log(
        `Já existe um import desta receita (${reason}${recipeId ? `, receita ${recipeId}` : ''}).`,
      );
      console.log('Use --force para gravar assim mesmo.\n');
    }
    if (result.savedRecipe) {
      console.log(`Salva como rascunho: /receita/${result.savedRecipe.slug}\n`);
    } else if (values.save && result.state === 'NEEDS ATTENTION') {
      console.log('A receita não passou na validação — só o import bruto foi guardado.\n');
    }
  }

  // A failed validation is a real outcome, not a crash: exit 2 so a batch
  // script can tell "needs a human" from "the importer broke".
  return result.outcome.validation.ok ? 0 : 2;
}

try {
  process.exitCode = await main();
} catch (error) {
  const stage = error instanceof FetchRefused ? 'robots' : 'import';
  console.error(`[ERROR]    stage=${stage} message=${JSON.stringify(String(error))}`);
  process.exitCode = 1;
}
