/**
 * magazine-vision — the one OpenAI-backed implementation of
 * `MagazineVisionProvider` (`src/lib/magazine-import/types.ts`).
 *
 * Three operations, one function, because they share everything that matters:
 * who may call it, how a page is described to the model, and how the cost of
 * the call is measured. `src/lib/magazine-import/providers/openai-edge.ts` is
 * the only caller, and it is also where the response gets validated against
 * `schema.ts` and retried once if that validation fails (§36 of the brief) —
 * this file's job ends at handing back whatever the model said.
 *
 *   classify_page    — what kind of page is this?
 *   read_index       — read a table of contents into title/page pairs
 *   extract_recipes  — read every recipe on the given page(s)
 *
 * §3 of the brief is explicit that hiding the import screen from non-admins is
 * not access control, and it is right: PostgREST and every Edge Function are
 * public endpoints. `authorize()` below is what actually stops a signed-in
 * stranger from spending the project's OpenAI budget — it checks the caller's
 * `profiles.role`, not just that a JWT exists.
 *
 * Deploy:
 *   supabase secrets set OPENAI_API_KEY=sk-...
 *   supabase functions deploy magazine-vision
 */
import { CLASSIFY_PAGE_PROMPT, EXTRACT_RECIPES_PROMPT, READ_INDEX_PROMPT } from './prompts.ts';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

/**
 * USD per 1M tokens. Illustrative of gpt-4o-mini's public pricing at the time
 * this was written — model prices change, which is exactly why migration 17's
 * `ai_usage_events.estimated_cost_usd` is computed here, at call time, rather
 * than derived later from whatever this table says today. Keep this current
 * with OpenAI's pricing page; a stale number under-reports cost, it does not
 * corrupt anything already written.
 */
const PRICE_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_1M[model];
  if (!price) return 0;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/* ---------------------------------------------------------------------------
 * Who is asking
 *
 * Two checks, not one: a valid session is necessary but not sufficient — this
 * screen is admin-only (§3), so the caller's own profile row is read back
 * (RLS already lets an owner read their own row) and `role` is checked. A
 * demoted admin loses access the moment their next request is verified here,
 * not whenever their token happens to expire.
 * ------------------------------------------------------------------------- */
async function authorize(
  request: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return { ok: false, response: json({ error: 'Faça login para importar magazines.' }, 401) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return { ok: false, response: json({ error: 'Função mal configurada.' }, 500) };
  }

  const whoami = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!whoami.ok) {
    return { ok: false, response: json({ error: 'Sessão expirada. Entre de novo.' }, 401) };
  }
  const user = (await whoami.json()) as { id?: string };
  if (!user.id) {
    return { ok: false, response: json({ error: 'Sessão inválida.' }, 401) };
  }

  // The caller's own JWT, not the service role: `profiles: read own` already
  // admits `id = auth.uid()`, which is exactly the one row this needs.
  const profile = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}`,
    { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } },
  );
  if (!profile.ok) {
    return { ok: false, response: json({ error: 'Não foi possível verificar sua permissão.' }, 500) };
  }
  const rows = (await profile.json()) as { role?: string }[];
  if (rows[0]?.role !== 'admin') {
    return {
      ok: false,
      response: json({ error: 'Só administradores podem importar magazines.' }, 403),
    };
  }

  return { ok: true, userId: user.id };
}

/* ---------------------------------------------------------------------------
 * What a page looks like on the way in
 * ------------------------------------------------------------------------- */

interface VisionPageInput {
  index: number;
  folio: number | null;
  imageDataUrl: string;
  text: string;
}

const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PAGES_PER_CALL = 6;
const MAX_IMAGE_BYTES = 6_000_000;
const MAX_TOTAL_BYTES = 20_000_000;
/** A page's text layer can be long; only the part that helps the model is worth sending. */
const MAX_TEXT_CHARS_PER_PAGE = 4_000;

function readPages(value: unknown): VisionPageInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, 'Envie ao menos uma página.');
  }
  if (value.length > MAX_PAGES_PER_CALL) {
    throw new HttpError(400, `No máximo ${MAX_PAGES_PER_CALL} páginas por chamada.`);
  }

  let totalBytes = 0;
  const pages = value.map((entry, position): VisionPageInput => {
    const candidate = entry as Partial<VisionPageInput>;
    if (typeof candidate.index !== 'number' || typeof candidate.imageDataUrl !== 'string') {
      throw new HttpError(400, `Página ${position + 1} do pedido está malformada.`);
    }
    if (!DATA_IMAGE.test(candidate.imageDataUrl)) {
      throw new HttpError(400, `Página ${position + 1} não trouxe uma imagem válida.`);
    }
    if (candidate.imageDataUrl.length > MAX_IMAGE_BYTES) {
      throw new HttpError(413, `A imagem da página ${position + 1} é grande demais.`);
    }
    totalBytes += candidate.imageDataUrl.length;

    return {
      index: candidate.index,
      folio: typeof candidate.folio === 'number' ? candidate.folio : null,
      imageDataUrl: candidate.imageDataUrl,
      text: typeof candidate.text === 'string' ? candidate.text.slice(0, MAX_TEXT_CHARS_PER_PAGE) : '',
    };
  });

  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new HttpError(413, 'As páginas enviadas juntas somam peso demais.');
  }
  return pages;
}

/** One text block plus one image block per page, so the model can tell them apart. */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'high' } };

function pagesToContent(pages: VisionPageInput[], label: (page: VisionPageInput) => string): ContentPart[] {
  return pages.flatMap((page): ContentPart[] => {
    const heading = label(page);
    const excerpt = page.text.trim();
    return [
      {
        type: 'text',
        text: excerpt ? `${heading}\nTexto já extraído desta página (pode ter erros de leitura):\n${excerpt}` : heading,
      },
      { type: 'image_url', image_url: { url: page.imageDataUrl, detail: 'high' } },
    ];
  });
}

function pageLabel(page: VisionPageInput): string {
  return page.folio !== null
    ? `Página ${page.folio} da revista (posição ${page.index} no arquivo).`
    : `Página na posição ${page.index} do arquivo (número impresso desconhecido).`;
}

/* ---------------------------------------------------------------------------
 * JSON Schemas — Structured Outputs, strict mode
 *
 * Every optional field is a nullable union rather than an absent key: `strict`
 * mode requires every property in `properties` to also be in `required`, and
 * an omitted optional would make OpenAI reject the request before generating a
 * token. Mirrors `src/lib/magazine-import/schema.ts` field for field — that
 * file is what actually validates the response; this shape only constrains
 * what the model is allowed to produce.
 * ------------------------------------------------------------------------- */

const nullable = (type: string) => ({ type: [type, 'null'] });

const PAGE_KINDS = [
  'cover',
  'advertisement',
  'editorial',
  'index',
  'article',
  'recipe',
  'recipe_index',
  'unknown',
];

const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'confidence', 'reasons', 'recipeTitles'],
  properties: {
    kind: { type: 'string', enum: PAGE_KINDS },
    confidence: { type: 'number' },
    reasons: { type: 'array', items: { type: 'string' } },
    recipeTitles: { type: 'array', items: { type: 'string' } },
  },
} as const;

const INDEX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'folio'],
        properties: {
          title: { type: 'string' },
          folio: nullable('number'),
        },
      },
    },
  },
} as const;

const CONFIDENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overall', 'title', 'ingredients', 'steps'],
  properties: {
    overall: { type: 'number' },
    title: { type: 'number' },
    ingredients: { type: 'number' },
    steps: { type: 'number' },
  },
} as const;

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'description',
    'servings',
    'prepMinutes',
    'cookMinutes',
    'restMinutes',
    'ingredients',
    'steps',
    'tips',
    'notes',
    'language',
    'continuationBefore',
    'continuationAfter',
    'confidence',
  ],
  properties: {
    title: { type: 'string' },
    description: nullable('string'),
    servings: nullable('number'),
    prepMinutes: nullable('number'),
    cookMinutes: nullable('number'),
    restMinutes: nullable('number'),
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['quantity', 'unit', 'ingredient', 'preparation', 'optional'],
        properties: {
          quantity: nullable('number'),
          unit: nullable('string'),
          ingredient: { type: 'string' },
          preparation: nullable('string'),
          optional: { type: 'boolean' },
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['order', 'instruction'],
        properties: {
          order: { type: 'number' },
          instruction: { type: 'string' },
        },
      },
    },
    tips: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
    language: nullable('string'),
    continuationBefore: { type: 'boolean' },
    continuationAfter: { type: 'boolean' },
    confidence: CONFIDENCE_SCHEMA,
  },
} as const;

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recipes'],
  properties: {
    recipes: { type: 'array', items: RECIPE_SCHEMA },
  },
} as const;

/* ---------------------------------------------------------------------------
 * The model call
 * ------------------------------------------------------------------------- */

interface Usage {
  provider: string;
  model: string;
  // Mirrors `AiUsage['operation']` in src/lib/magazine-import/types.ts exactly
  // — the client stores this value verbatim in `ai_usage_events.operation`.
  operation: 'classify_page' | 'read_index' | 'extract_recipe';
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

async function callVisionModel(
  operation: Usage['operation'],
  systemPrompt: string,
  content: ContentPart[],
  schemaName: string,
  schema: object,
  openaiKey: string,
): Promise<{ data: unknown; usage: Usage }> {
  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      // Reading, not writing: the least inventive setting the API allows.
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('OpenAI rejected the vision call', operation, upstream.status, detail.slice(0, 500));
    throw new HttpError(502, 'Não consegui analisar essa página agora. Tente de novo.');
  }

  const payload = (await upstream.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const answer = payload.choices?.[0]?.message?.content;
  if (!answer) throw new HttpError(502, 'Resposta vazia do modelo.');

  let data: unknown;
  try {
    data = JSON.parse(answer);
  } catch {
    throw new HttpError(502, 'A resposta do modelo veio num formato inesperado.');
  }

  const inputTokens = payload.usage?.prompt_tokens ?? 0;
  const outputTokens = payload.usage?.completion_tokens ?? 0;

  return {
    data,
    usage: {
      provider: 'openai',
      model: MODEL,
      operation,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(MODEL, inputTokens, outputTokens),
    },
  };
}

/* ---------------------------------------------------------------------------
 * Handler
 * ------------------------------------------------------------------------- */

interface RequestBody {
  operation?: string;
  pages?: unknown;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return json({ error: 'A leitura de magazines ainda não foi configurada.' }, 503);

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: 'Pedido inválido.' }, 400);
  }

  try {
    const pages = readPages(body.pages);

    switch (body.operation) {
      case 'classify_page': {
        if (pages.length !== 1) {
          throw new HttpError(400, 'classify_page recebe exatamente uma página.');
        }
        const content = pagesToContent(pages, pageLabel);
        const result = await callVisionModel(
          'classify_page',
          CLASSIFY_PAGE_PROMPT,
          content,
          'page_verdict',
          CLASSIFY_SCHEMA,
          openaiKey,
        );
        return json(result);
      }

      case 'read_index': {
        const content = pagesToContent(pages, pageLabel);
        const result = await callVisionModel(
          'read_index',
          READ_INDEX_PROMPT,
          content,
          'recipe_index',
          INDEX_SCHEMA,
          openaiKey,
        );
        return json(result);
      }

      case 'extract_recipe': {
        const content = pagesToContent(pages, pageLabel);
        const result = await callVisionModel(
          'extract_recipe',
          EXTRACT_RECIPES_PROMPT,
          content,
          'extraction',
          EXTRACTION_SCHEMA,
          openaiKey,
        );
        return json(result);
      }

      default:
        return json(
          { error: 'operation deve ser classify_page, read_index ou extract_recipe.' },
          400,
        );
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('magazine-vision failed', error);
    return json({ error: 'Não consegui processar essa página agora.' }, 502);
  }
});

// Deno loads every file as a module; saying so lets one `tsc` pass check all
// four functions without them colliding in a shared global scope.
export {};
