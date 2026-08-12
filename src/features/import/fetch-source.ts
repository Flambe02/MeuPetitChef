/**
 * The browser's way to reach a page it is not allowed to fetch.
 *
 * Cookomix, Cookidoo, Instagram and Facebook send no CORS headers, so a
 * `fetch()` from the tab is refused before it leaves the machine. The
 * `import-recipe` Edge Function does it server-side and hands back either the
 * page's HTML — parsed here by the same provider parsers the CLI uses — or, for
 * a social post where there is nothing structured to parse, the caption already
 * read into a `schema.org/Recipe` object.
 *
 * Both land in `runImport` as `{ html }` or `{ structuredData }`, which is the
 * shape it has always accepted.
 */
import { supabase } from '@/lib/supabase/client';
import { DataError, readFunctionError } from '@/lib/supabase/errors';
import type { ProviderId } from '@/lib/recipe-import/types';

export interface FetchedSource {
  provider: ProviderId;
  /** The page, when the source is a recipe site. */
  html: string | null;
  /** A schema.org Recipe, when the source was a caption read by the model. */
  structuredData: unknown;
  /** After redirects — this is what gets recorded as the recipe's origin. */
  finalUrl: string | null;
  /** What the caption did not say. Shown as warnings on the review screen. */
  missing: string[];
}

interface FunctionResponse {
  kind?: 'html' | 'structured';
  provider?: ProviderId;
  finalUrl?: string | null;
  html?: string;
  recipe?: unknown;
  missing?: string[];
  error?: string;
}

/**
 * Fetches a URL, or reads a pasted caption, through the Edge Function.
 *
 * Errors arrive as a readable pt-BR sentence in `error` — "esse post pode ser
 * privado", "o site recusou o acesso" — and are surfaced verbatim, because each
 * one tells the person a different thing to do next.
 */
export async function fetchSource(input: {
  url?: string;
  text?: string;
  images?: string[];
}): Promise<FetchedSource> {
  // Cast at the boundary: `functions.invoke` types its payload as `any`, and
  // destructuring that into locals launders the unsafety silently.
  const { data, error } = (await supabase.functions.invoke('import-recipe', {
    body: input,
  })) as { data: FunctionResponse | null; error: unknown };

  if (data?.error) throw new DataError(data.error);

  if (error) {
    // Every refusal this function makes is a different instruction — the post
    // is private, the site said no, that host is not supported. Losing them to
    // a generic message would leave the person with nothing to try next.
    const detail = await readFunctionError(error);
    throw new DataError(
      detail ?? 'Não consegui buscar essa receita agora. Verifique sua conexão e tente de novo.',
      { cause: error },
    );
  }
  if (!data?.kind || !data.provider) {
    throw new DataError('O serviço de importação respondeu de um jeito inesperado.');
  }

  return {
    provider: data.provider,
    html: data.kind === 'html' ? (data.html ?? null) : null,
    structuredData: data.kind === 'structured' ? data.recipe : undefined,
    finalUrl: data.finalUrl ?? null,
    missing: data.missing ?? [],
  };
}
