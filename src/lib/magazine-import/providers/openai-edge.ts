/**
 * The OpenAI-backed `MagazineVisionProvider`.
 *
 * Every model call goes through the `magazine-vision` Edge Function — the
 * OpenAI key never reaches the browser, and the function is where the
 * admin-only check actually lives (§3 of the brief: hiding a screen is not
 * access control). This file's job is narrower: call the function, validate
 * what comes back against `../schema.ts`, and retry once before giving up
 * (§36 — "toute réponse invalide doit retry automatiquement une fois puis
 * passer needs_review si elle reste invalide").
 *
 * Swapping providers — Anthropic, Gemini, a future in-house model — means a
 * second file implementing `MagazineVisionProvider` and a line in whatever
 * assembles the pipeline. Nothing that calls a provider through the interface
 * changes.
 */
import { supabase } from '@/lib/supabase/client';
import { DataError } from '@/lib/supabase/errors';
import { readFunctionError } from '@/lib/supabase/errors';

import { extractionSchema, pageVerdictSchema, recipeIndexSchema } from '../schema.ts';
import type {
  AiUsage,
  MagazineVisionProvider,
  PageVerdict,
  ProviderResult,
  RecipeIndexEntry,
  VisionPage,
} from '../types.ts';

/**
 * The model answered, but not in the shape `schema.ts` expects.
 *
 * Distinguished from `DataError` so the pipeline can tell "the network failed,
 * retry the page next run" apart from "the model's JSON was malformed twice in
 * a row, stop and ask a human" — the two failures in §36 call for different
 * handling, and a caller that only sees `Error` cannot tell them apart.
 */
export class InvalidVisionResponseError extends Error {
  constructor(
    readonly operation: string,
    readonly issues: string,
  ) {
    super(`Resposta inválida em ${operation}: ${issues}`);
    this.name = 'InvalidVisionResponseError';
  }
}

interface FunctionResponse {
  data?: unknown;
  usage?: AiUsage;
  error?: string;
}

async function callFunction(operation: string, pages: VisionPage[]): Promise<FunctionResponse> {
  const { data, error } = (await supabase.functions.invoke('magazine-vision', {
    body: { operation, pages },
  })) as { data: FunctionResponse | null; error: unknown };

  if (data?.error) throw new DataError(data.error);
  if (error) {
    const detail = await readFunctionError(error);
    throw new DataError(detail ?? 'Não foi possível analisar essa página agora.', { cause: error });
  }
  if (!data) throw new DataError('O serviço de leitura respondeu vazio.');
  return data;
}

interface ZodLike<T> {
  safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: unknown };
}

/**
 * One call, validated, with one retry on a shape failure.
 *
 * The retry is deliberately narrow: it fires only when the JSON parsed but
 * failed `schema.ts`'s validation, never on a network or authorization error —
 * retrying a 403 five times would not make the caller an admin.
 */
async function callAndValidate<T>(
  operation: string,
  pages: VisionPage[],
  schema: ZodLike<T>,
): Promise<ProviderResult<T>> {
  const attempt = async (): Promise<ProviderResult<T>> => {
    const response = await callFunction(operation, pages);
    const parsed = schema.safeParse(response.data);
    if (!parsed.success) {
      throw new InvalidVisionResponseError(operation, JSON.stringify(parsed.error));
    }
    if (!response.usage) throw new DataError('Resposta sem informação de custo.');
    return { data: parsed.data, usage: response.usage };
  };

  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof InvalidVisionResponseError)) throw error;
    return await attempt();
  }
}

export const openaiEdgeProvider: MagazineVisionProvider = {
  id: 'openai-edge',
  model: 'gpt-4o-mini',

  async analyzePage(page: VisionPage): Promise<ProviderResult<PageVerdict>> {
    const result = await callAndValidate('classify_page', [page], pageVerdictSchema);
    return { data: { ...result.data, by: 'vision' }, usage: result.usage };
  },

  async readIndex(pages: VisionPage[]): Promise<ProviderResult<RecipeIndexEntry[]>> {
    const result = await callAndValidate('read_index', pages, recipeIndexSchema);
    // An entry without a legible page number cannot drive "open page X", which
    // is the only thing an index entry is for here — `folio.ts`'s conversion
    // needs a real number, and `RecipeIndexEntry` is typed accordingly rather
    // than pushing a null check onto every reader of it.
    const entries = result.data.entries.filter(
      (entry): entry is RecipeIndexEntry => entry.folio !== null,
    );
    return { data: entries, usage: result.usage };
  },

  async extractRecipes(pages: VisionPage[]) {
    const result = await callAndValidate('extract_recipe', pages, extractionSchema);
    return { data: result.data.recipes, usage: result.usage };
  },
};
