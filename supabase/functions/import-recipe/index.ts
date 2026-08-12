/**
 * import-recipe — fetches a recipe URL on behalf of the app, and reads a social
 * caption into a recipe when the page has no structured data.
 *
 * The app could never do the first half itself. Cookomix, Cookidoo, Instagram
 * and Facebook send no CORS headers, so `fetch()` from the tab is refused
 * before it leaves the machine — which is why the import screen used to ask the
 * user to paste a page's source by hand. A server has no such restriction.
 *
 * Two paths out, and the difference matters:
 *
 *   * **a recipe site** (Cookomix, Cookidoo) → the HTML comes back and the
 *     browser parses it with the same tested provider parsers the CLI uses. No
 *     model is involved: those pages publish `schema.org/Recipe`, and a parser
 *     that reads "20 min/100 °C/vitesse 1" exactly is worth more than one that
 *     reads it approximately.
 *   * **a social post** (Instagram, Facebook) → there is nothing structured to
 *     parse, only a caption. The model turns that caption into a
 *     `schema.org/Recipe` object, which the browser then parses through the
 *     very same pipeline. Extraction only: it is told, and the prompt says so
 *     twice, that a quantity not written in the caption is `null` and never a
 *     guess.
 *
 * Deploy:
 *   supabase secrets set OPENAI_API_KEY=sk-...
 *   supabase functions deploy import-recipe
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

/** Big enough for a recipe page, small enough that a video URL cannot bankrupt us. */
const MAX_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
/** Captions are short; a whole page of markup is not worth sending to a model. */
const MAX_CAPTION_CHARS = 12_000;

/* ---------------------------------------------------------------------------
 * What may be fetched
 *
 * This list is the security boundary, not a convenience. The browser has its
 * own copy of the same knowledge to decide which button to enable, but that one
 * is UX and is trivially bypassed — a server that fetches whatever a client
 * asks it to is an open proxy into everything the function can reach, including
 * the platform's own metadata endpoints. Hence: an allowlist of registrable
 * domains, https only, and the same check re-run on every redirect hop.
 * ------------------------------------------------------------------------- */

type Provider = 'cookomix' | 'cookidoo' | 'social';

const ALLOWED: { pattern: RegExp; provider: Provider }[] = [
  { pattern: /(^|\.)cookomix\.com$/i, provider: 'cookomix' },
  { pattern: /(^|\.)cookidoo\.[a-z]{2,}(\.[a-z]{2,})?$/i, provider: 'cookidoo' },
  { pattern: /(^|\.)instagram\.com$/i, provider: 'social' },
  { pattern: /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/i, provider: 'social' },
];

function providerFor(url: URL): Provider | null {
  if (url.protocol !== 'https:') return null;
  return ALLOWED.find((entry) => entry.pattern.test(url.hostname))?.provider ?? null;
}

/**
 * Identifiable, with a contact address, and no pretending to be a browser.
 *
 * The project's rule (docs §7) is that nothing here impersonates anyone or
 * works around a protection. The practical cost is real and accepted: Instagram
 * answers a login wall to most non-browser callers, and when it does, this
 * function says so and points at the paste box instead of dressing up as
 * Chrome to get in.
 */
const USER_AGENT =
  'MeuPetitChefBot/1.0 (+https://github.com/Flambe02/MeuPetitChef; recipe import requested by a user)';

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

/* ---------------------------------------------------------------------------
 * Fetching
 * ------------------------------------------------------------------------- */

interface Fetched {
  finalUrl: string;
  provider: Provider;
  html: string;
}

/**
 * Follows redirects by hand so every hop is checked against the allowlist.
 *
 * `redirect: 'follow'` would validate the URL the user pasted and then happily
 * follow it to anywhere at all — a shortener, an internal address, a metadata
 * service. Checking only the first hop is the same as not checking.
 */
async function fetchAllowed(start: URL): Promise<Fetched> {
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const provider = providerFor(current);
    if (!provider) {
      throw new HttpError(
        400,
        `Não podemos baixar ${current.hostname}. Use um endereço do Cookomix, do Cookidoo, do Instagram ou do Facebook.`,
      );
    }

    const response = await fetch(current.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        // Recipe sites serve the page in the language of the request; Brazilian
        // Portuguese first, then the site's own default.
        'Accept-Language': 'pt-BR,pt;q=0.9,fr;q=0.6,en;q=0.5',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      // The body of a redirect is empty, but it still holds a connection open.
      await response.body?.cancel();
      if (!location) throw new HttpError(502, 'A página respondeu um redirecionamento vazio.');
      current = new URL(location, current);
      continue;
    }

    if (response.status === 404) {
      await response.body?.cancel();
      throw new HttpError(404, 'Essa página não existe mais.');
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new HttpError(
        422,
        provider === 'social'
          ? 'Esse post está fechado para quem não está logado. Copie a legenda e cole no campo de texto.'
          : 'O site recusou o acesso a essa página. Abra a receita no navegador, copie o conteúdo e cole no campo de texto.',
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(502, `O site respondeu ${response.status}. Tente de novo mais tarde.`);
    }

    return { finalUrl: current.toString(), provider, html: await readCapped(response) };
  }

  throw new HttpError(502, 'A página redirecionou vezes demais.');
}

/**
 * Reads the body up to a cap, so a huge response cannot exhaust the worker.
 *
 * Truncation keeps whole chunks: a half-copied buffer would leave the tail of
 * the string as NUL padding, and that padding travels all the way into the
 * parser as if the page really ended in it.
 */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let kept = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (kept + value.byteLength > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
    kept += value.byteLength;
  }

  const joined = new Uint8Array(kept);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(joined);
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
 * Reading a caption out of a social page
 * ------------------------------------------------------------------------- */

function metaContent(html: string, property: string): string | null {
  // Both attribute orders occur, and Facebook uses `property` while Instagram
  // has used `name` on the same tag at different times.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(html)?.[1];
    if (found) return decodeEntities(found).trim() || null;
  }
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // The `x` has to be captured, not just matched: without it `&#x27;` and
    // `&#27;` arrive here identically and one of the two decodes wrong.
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex: string, code: string) =>
      String.fromCodePoint(parseInt(code, hex ? 16 : 10)),
    )
    .replace(/&amp;/g, '&');
}

/**
 * Instagram's own furniture, removed from around the caption.
 *
 * What the tag actually contains is
 * `6 likes, 0 comments - fulano no March 14, 2024: "<the caption>"`, and the
 * model reads that preamble as the beginning of the text: on a real post it
 * answered "no title" for a caption whose first line names the dish, because
 * the first line it saw was an engagement count. Reach counts are not part of
 * the recipe.
 */
function stripSocialChrome(text: string): string {
  let out = text.trim();
  // "6 likes, 0 comments - user no March 14, 2024: " — the wording is localised,
  // the shape is not. Bounded so a caption that merely mentions likes survives.
  out = out.replace(/^[\d.,\s]*\b(?:likes?|curtidas?|me gusta|j'aime)\b[^:]{0,160}:\s*/iu, '');
  // "Fulano no Instagram: " — the same, on og:title.
  out = out.replace(/^[\w.]{2,40}\s+(?:no|on|em|sur)\s+(?:Instagram|Facebook)\s*:\s*/iu, '');
  const quoted = /^"([\s\S]*)"\.?$/.exec(out);
  if (quoted?.[1] !== undefined) out = quoted[1];
  // og:title arrives truncated mid-caption, so its closing quote never comes.
  return out.replace(/^"/, '').trim();
}

/**
 * The caption, from the meta tags a public post still serves.
 *
 * `og:description` is the caption itself on both networks, and the only field
 * that survives the page body being a React shell — which it always is.
 * `og:title` is the same text truncated, so it is a fallback and never an
 * addition: joining both fed the model the opening lines twice.
 */
function readCaption(html: string): string | null {
  const description = metaContent(html, 'og:description') ?? metaContent(html, 'description');
  const caption =
    stripSocialChrome(description ?? '') || stripSocialChrome(metaContent(html, 'og:title') ?? '');

  if (caption.length < 40) return null;
  return caption.slice(0, MAX_CAPTION_CHARS);
}

/* ---------------------------------------------------------------------------
 * The reading pass
 * ------------------------------------------------------------------------- */

const nullable = (type: string) => ({ type: [type, 'null'] });

/**
 * Extraction, not authorship.
 *
 * Deliberately *not* the rich schema `generate-recipe` uses: that one asks a
 * model to write a recipe, and every optional field it fills is a reasonable
 * invention. Here an invention is a defect — someone will cook this. So the
 * shape is flat, the fields are the ones a caption actually contains, and
 * everything else is null.
 */
const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_recipe',
    'title',
    'description',
    'language',
    'servings',
    'total_minutes',
    'ingredients',
    'steps',
    'missing',
  ],
  properties: {
    is_recipe: { type: 'boolean' },
    title: nullable('string'),
    description: nullable('string'),
    /** BCP-47, read from the caption itself — never forced to pt-BR. */
    language: nullable('string'),
    servings: nullable('integer'),
    total_minutes: nullable('integer'),
    ingredients: {
      type: 'array',
      items: { type: 'string' },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['verb', 'text'],
        properties: {
          verb: nullable('string'),
          text: { type: 'string' },
        },
      },
    },
    /** What the caption did not say, so the review screen can warn about it. */
    missing: { type: 'array', items: { type: 'string' } },
  },
} as const;

const EXTRACTION_PROMPT = `Você extrai receitas de legendas de posts e de textos colados.

Seu trabalho é LER e ESTRUTURAR. Não é escrever, não é completar, não é melhorar.

REGRA ABSOLUTA — nunca invente:
- Quantidade que não está escrita no texto: deixe fora da linha do ingrediente.
- Tempo, temperatura ou velocidade que não estão escritos: não escreva nenhum.
- Porções não informadas: "servings" = null.
- Se o texto não traz o modo de preparo, devolva "steps" vazio. NÃO deduza o
  preparo a partir dos ingredientes: quem vai cozinhar confia no que está aí.
Uma receita incompleta é útil e honesta; uma receita inventada estraga o jantar.

TÍTULO — sempre nomeie o prato. Quase nenhuma legenda traz um título separado:
use o nome do prato como o autor o escreve na primeira linha, sem emoji, sem
hashtag, sem o nome do perfil e sem contagem de curtidas. "Mon steak (🤫) et
taboulé de chou fleur avec un œuf au plat 🤩" vira "Steak et taboulé de chou
fleur avec un œuf au plat". "title" só é null quando "is_recipe" é false —
uma receita sem nome não entra no aplicativo.

NÃO TRADUZA. Mantenha exatamente o idioma do texto original, inclusive os nomes
dos ingredientes. Em "language" devolva o idioma que você leu ("pt-BR", "fr-FR",
"en-US"). A tradução é outra etapa do aplicativo, explícita, e não é esta.

INGREDIENTES: uma linha por ingrediente, como está escrito, com a quantidade e a
unidade na mesma linha ("2 colheres de sopa de azeite", "500 g de frango").
Não separe em campos, não converta unidades, não normalize nomes.

PASSOS: uma ação por passo. "verb" é UMA palavra no imperativo (Refogar, Assar,
Bater, Misturar) quando o texto deixa claro; caso contrário null. "text" é a
instrução como o autor escreveu, no máximo reorganizada em frases separadas.
Mantenha os números que o autor deu — "por 15 minutos", "a 180 °C", "vel. 5" —
porque o aplicativo lê esses números para montar o cronômetro.

"missing": liste em português do Brasil o que faltou no texto ("quantidades",
"tempo de forno", "número de porções"), para quem for revisar.

"is_recipe" = false quando o texto não é uma receita (um anúncio, uma foto de
prato pronto sem preparo, um texto qualquer). Nesse caso os outros campos podem
vir vazios.`;

/**
 * The same reading, from screenshots instead of text.
 *
 * A print of a post carries the caption as pixels, and often carries it *split*
 * across several prints because the caption did not fit one screen. So the
 * captures go in one request, in the order the person picked them, and the
 * model is told to treat them as one continuous text — otherwise it answers
 * three half-recipes for three prints of one recipe.
 */
const IMAGE_PROMPT = `As imagens são capturas de tela de um post de receita, na ordem em que foram
tiradas. Leia TODAS como um texto único e contínuo: uma legenda longa costuma
ser cortada em várias capturas, e a lista de ingredientes de uma pode continuar
na seguinte. Não devolva uma receita por imagem — devolva uma só.

Leia o que estiver escrito na tela: a legenda, o texto sobre o vídeo, uma lista
de ingredientes fotografada. Ignore o que é interface do aplicativo — nome do
perfil, curtidas, comentários, botões, horário do celular, barra de navegação.

O que estiver ilegível, cortado ou tapado não existe: deixe em branco e cite em
"missing". Não complete um ingrediente pela metade nem adivinhe um número
borrado — quem vai cozinhar confia no que está aí.`;

interface Extraction {
  is_recipe: boolean;
  title: string | null;
  description: string | null;
  language: string | null;
  servings: number | null;
  total_minutes: number | null;
  ingredients: string[];
  steps: { verb: string | null; text: string }[];
  missing: string[];
}

/** A text message, or a text message followed by the captures. */
type UserContent = string | ({ type: 'text'; text: string } | ImagePart)[];
interface ImagePart {
  type: 'image_url';
  image_url: { url: string; detail: 'high' };
}

async function extractRecipe(content: UserContent, openaiKey: string): Promise<Extraction> {
  const hasImages = Array.isArray(content);

  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      // Extraction, not creation: the least inventive setting the API allows.
      temperature: 0,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        ...(hasImages ? [{ role: 'system', content: IMAGE_PROMPT }] : []),
        { role: 'user', content },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'extraction', strict: true, schema: EXTRACTION_SCHEMA },
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('OpenAI rejected the extraction', upstream.status, detail.slice(0, 500));
    throw new HttpError(502, 'Não consegui ler essa receita agora. Tente de novo.');
  }

  const payload = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
  // Not `content`: that is the parameter above, and a `const` of the same name
  // in the same scope is a parse error — the function then fails to boot at all
  // rather than at this line.
  const answer = payload.choices?.[0]?.message?.content;
  if (!answer) throw new HttpError(502, 'Resposta vazia ao ler a receita.');

  try {
    return JSON.parse(answer) as Extraction;
  } catch {
    throw new HttpError(502, 'A leitura da receita voltou num formato inesperado.');
  }
}

/**
 * The extraction, dressed as `schema.org/Recipe`.
 *
 * Not decoration: it is what lets the browser run this through the exact same
 * parser, normalizer and validator as a page that served its own JSON-LD. One
 * pipeline, one place where a recipe becomes canonical.
 */
function toSchemaOrg(extraction: Extraction, source: { url: string | null; image: string | null }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: extraction.title ?? '',
    description: extraction.description,
    inLanguage: extraction.language,
    // Minutes → ISO 8601 here rather than asking the model for "PT35M": a
    // malformed duration would silently become "no time at all".
    totalTime: extraction.total_minutes ? `PT${Math.round(extraction.total_minutes)}M` : null,
    recipeYield: extraction.servings ? String(extraction.servings) : null,
    recipeIngredient: extraction.ingredients,
    recipeInstructions: extraction.steps.map((step) => ({
      '@type': 'HowToStep',
      name: step.verb,
      text: step.text,
    })),
    image: source.image,
    url: source.url,
  };
}

/* ---------------------------------------------------------------------------
 * Handler
 * ------------------------------------------------------------------------- */

interface RequestBody {
  /** A URL to fetch. Omit when sending `text` or `images`. */
  url?: string;
  /** A caption or recipe pasted by hand — the way in when a page is gated. */
  text?: string;
  /** Screenshots of a post, as `data:image/…;base64,…`, in reading order. */
  images?: string[];
}

/** Only real, inline images. A `data:` URL cannot point anywhere else. */
const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|webp|heic);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 8_000_000;

/**
 * Validates the captures before a single token is spent.
 *
 * `data:` only, and deliberately so: accepting an `https://` image here would
 * hand back the arbitrary-fetch hole the allowlist exists to close, this time
 * through the model's own image loader.
 */
function readImages(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const images = values.filter((value): value is string => typeof value === 'string');
  if (images.length === 0) return [];
  if (images.length > MAX_IMAGES) {
    throw new HttpError(400, `Envie no máximo ${MAX_IMAGES} capturas de uma vez.`);
  }

  let total = 0;
  for (const image of images) {
    if (!DATA_IMAGE.test(image)) {
      throw new HttpError(400, 'Uma das capturas não é uma imagem válida.');
    }
    total += image.length;
  }
  if (total > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'As capturas somam peso demais. Envie menos imagens de cada vez.');
  }

  return images;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  // ── Who is asking ────────────────────────────────────────────────────────
  // Same gate as generate-recipe: this function spends tokens and makes
  // outbound requests, and neither should be available to anonymous callers.
  const jwt = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Faça login para importar uma receita.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Função mal configurada.' }, 500);

  const whoami = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
  });
  if (!whoami.ok) return json({ error: 'Sessão expirada. Entre de novo.' }, 401);

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: 'Pedido inválido.' }, 400);
  }

  const rawUrl = (body.url ?? '').trim();
  const pastedText = (body.text ?? '').trim();

  try {
    /* ── Screenshots ────────────────────────────────────────────────────── */
    // First, and on purpose: someone who sent captures sent them *because* the
    // link would not open. Falling back to fetching the URL they also pasted
    // would answer a question they had already given up on.
    const images = readImages(body.images);
    if (images.length > 0) {
      if (!openaiKey) return json({ error: 'A leitura por IA ainda não foi configurada.' }, 503);

      const extraction = await extractRecipe(
        [
          {
            type: 'text',
            text: pastedText
              ? `Contexto escrito pela pessoa: ${pastedText.slice(0, 2000)}`
              : 'Leia a receita destas capturas.',
          },
          ...images.map(
            (image): ImagePart => ({ type: 'image_url', image_url: { url: image, detail: 'high' } }),
          ),
        ],
        openaiKey,
      );

      if (!extraction.is_recipe) {
        return json({ error: 'Não encontrei uma receita nessas capturas.' }, 422);
      }
      return json({
        kind: 'structured',
        provider: 'social',
        finalUrl: rawUrl || null,
        recipe: toSchemaOrg(extraction, { url: rawUrl || null, image: null }),
        missing: extraction.missing,
      });
    }

    /* ── A pasted caption, no fetching involved ─────────────────────────── */
    if (!rawUrl) {
      if (pastedText.length < 40) {
        return json({ error: 'Cole o endereço da receita, o texto dela, ou envie capturas.' }, 400);
      }
      if (!openaiKey) return json({ error: 'A leitura por IA ainda não foi configurada.' }, 503);

      const extraction = await extractRecipe(pastedText.slice(0, MAX_CAPTION_CHARS), openaiKey);
      if (!extraction.is_recipe) {
        return json({ error: 'Esse texto não parece uma receita.' }, 422);
      }
      return json({
        kind: 'structured',
        provider: 'social',
        finalUrl: null,
        recipe: toSchemaOrg(extraction, { url: null, image: null }),
        missing: extraction.missing,
      });
    }

    /* ── A URL ──────────────────────────────────────────────────────────── */
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return json({ error: 'Esse endereço não é válido.' }, 400);
    }
    if (!providerFor(url)) {
      return json(
        {
          error:
            'Por enquanto sabemos ler Cookomix, Cookidoo, Instagram e Facebook. ' +
            'De outro site, copie a receita e cole no campo de texto.',
        },
        400,
      );
    }

    const fetched = await fetchAllowed(url);

    // A recipe site parses deterministically in the browser — no model, no
    // tokens, and the Thermomix parameters come through exactly as written.
    if (fetched.provider !== 'social') {
      return json({
        kind: 'html',
        provider: fetched.provider,
        finalUrl: fetched.finalUrl,
        html: fetched.html,
      });
    }

    if (!openaiKey) return json({ error: 'A leitura por IA ainda não foi configurada.' }, 503);

    const caption = readCaption(fetched.html);
    if (!caption) {
      // The common case, and worth an honest message: the page came back, it
      // just came back as a login wall with no caption in it.
      return json(
        {
          error:
            'Não consegui ler a legenda desse post — ele pode ser privado ou pedir login. ' +
            'Abra o post, copie a legenda e cole no campo de texto.',
        },
        422,
      );
    }

    const extraction = await extractRecipe(caption, openaiKey);
    if (!extraction.is_recipe) {
      return json({ error: 'Esse post não parece trazer uma receita.' }, 422);
    }

    return json({
      kind: 'structured',
      provider: 'social',
      finalUrl: fetched.finalUrl,
      recipe: toSchemaOrg(extraction, {
        url: fetched.finalUrl,
        image: metaContent(fetched.html, 'og:image'),
      }),
      missing: extraction.missing,
    });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return json({ error: 'O site demorou demais para responder.' }, 504);
    }
    console.error('import-recipe failed', error);
    return json({ error: 'Não consegui buscar essa receita agora.' }, 502);
  }
});

// Deno loads every file as a module; saying so lets one `tsc` pass check all
// three functions without them colliding in a shared global scope.
export {};
