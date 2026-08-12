/**
 * Build the URL list a batch import feeds on.
 *
 *   npm run recipe:urls -- --provider cookomix --out urls.txt
 *   npm run recipe:urls -- --provider cookomix --limit 50 --out essai.txt
 *
 * Reads the provider's own sitemap — the file a site publishes precisely so
 * its pages can be discovered — and writes one recipe URL per line. No
 * crawling: a sitemap is a handful of requests, where walking the category
 * pages would be thousands.
 *
 * The output is a plain text file, so it can be trimmed by hand before
 * importing. That matters: 2 400 recipes is a decision, not a default.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import type { ProviderId } from '../../src/lib/recipe-import/types.ts';
import { fetchPage } from './runtime/fetcher.ts';
import { createLogger } from './runtime/log.ts';

interface SitemapSource {
  /** The sitemap index to start from. */
  index: string;
  /** Which child sitemaps hold recipes. */
  isRecipeSitemap: (url: string) => boolean;
  /** Which URLs inside them are actual recipes rather than taxonomy pages. */
  isRecipeUrl: (url: string) => boolean;
}

const SOURCES: Partial<Record<ProviderId, SitemapSource>> = {
  cookomix: {
    index: 'https://www.cookomix.com/sitemap_index.xml',
    isRecipeSitemap: (url) => /recipe-sitemap\d*\.xml$/.test(url),
    // `/recettes/` also carries the taxonomy pages (categories, seasons,
    // ingredients…), which are listings, not recipes.
    isRecipeUrl: (url) =>
      /\/recettes\/[^/]+\/$/.test(url) &&
      !/\/recettes\/(categories|type-plat|profil|origine|saison|ingredients)\//.test(url),
  },
  // Cookidoo publishes no recipe sitemap — its `sitemap.xml` lists only the
  // marketing pages. Its recipes are found through the site's own search,
  // behind a session, so there is no list to build here. See
  // docs/recipe-importers.md, §3.
};

const USAGE = `
Uso:
  npm run recipe:urls -- --provider cookomix [--out urls.txt] [--limit <n>]

Opções:
  --provider <id>   Provedor (por enquanto: cookomix)
  --out <caminho>   Arquivo de saída (padrão urls.txt)
  --limit <n>       Guarda no máximo n URLs
  --help
`.trim();

/** `<loc>` values, without pulling in an XML parser for four characters. */
function locations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((match) => match[1])
    .filter((url): url is string => Boolean(url));
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      provider: { type: 'string' },
      out: { type: 'string' },
      limit: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help || !values.provider) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const source = SOURCES[values.provider as ProviderId];
  if (!source) {
    console.error(
      `Sem sitemap de receitas para "${values.provider}". ` +
        `Disponíveis: ${Object.keys(SOURCES).join(', ')}.`,
    );
    return 1;
  }

  const logger = createLogger();
  const out = values.out ?? 'urls.txt';
  const limit = values.limit ? Number(values.limit) : Number.POSITIVE_INFINITY;

  logger.stage('FETCH', { sitemap: source.index });
  const index = await fetchPage(source.index, { delayMs: 1000 });
  const children = locations(index.html).filter(source.isRecipeSitemap);
  logger.stage('PARSE', { sitemaps: children.length });

  const urls = new Set<string>();
  for (const child of children) {
    // One request per child sitemap, a second apart. Three files for 2 400
    // recipes — this is the cheap way to get the list.
    const page = await fetchPage(child, { delayMs: 1000 });
    const found = locations(page.html).filter(source.isRecipeUrl);
    logger.stage('PARSE', { sitemap: child.split('/').pop(), recipes: found.length });
    for (const url of found) {
      if (urls.size >= limit) break;
      urls.add(url);
    }
    if (urls.size >= limit) break;
  }

  const header = [
    `# ${urls.size} receitas de ${values.provider}`,
    `# Gerado por: npm run recipe:urls -- --provider ${values.provider}`,
    '# Uma URL por linha. Linhas vazias e começadas por # são ignoradas.',
    '',
  ].join('\n');

  await writeFile(out, `${header}${[...urls].join('\n')}\n`, 'utf8');

  console.log('');
  console.log(`${urls.size} URLs escritas em ${out}`);
  console.log('');
  console.log('Próximo passo — comece pequeno:');
  console.log(`  npm run recipe:import-batch -- --input ${out} --limit 10 --save`);
  console.log('');
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`[ERROR]    stage=urls message=${JSON.stringify(String(error))}`);
  process.exitCode = 1;
}
