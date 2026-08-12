/**
 * adapt-recipe — turns an imported recipe into a Brazilian one.
 *
 * The import keeps the source faithfully: a Cookomix recipe lands in the
 * catalogue in French, with crème fraîche épaisse and "Cuire 20 min/100°C".
 * Nobody in Brazil searches for that. This function rewrites the prose into
 * pt-BR and swaps the products that do not exist in a Brazilian supermarket.
 *
 * Two callers, both legitimate:
 *   * the app, with a user's JWT — one recipe, from the import screen;
 *   * the batch CLI, with the service-role key — the whole catalogue.
 *
 * What it is NOT allowed to do, and what the caller verifies afterwards
 * (`src/lib/recipe-import/adapt.ts`): change a duration, a temperature, a
 * Thermomix speed, a quantity, or the number and order of steps. Those came
 * off a machine panel. Most of them are never even sent — they live in their
 * own columns — and the ones embedded in the instruction text are checked on
 * return. A model that quietly turns "20 min" into "2 min" writes a recipe
 * that reads perfectly and burns dinner.
 *
 * Deploy:
 *   supabase secrets set OPENAI_API_KEY=sk-...
 *   supabase functions deploy adapt-recipe
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

const nullable = (type: string) => ({ type: [type, 'null'] });

/**
 * Structured Outputs in `strict` mode: every key in `properties` must appear in
 * `required`, and every object must set `additionalProperties: false`. An
 * optional field is a nullable union, never an absent one — otherwise the API
 * rejects the request with a 400 before generating a token.
 *
 * Every item carries the `id` it came in with, so the caller writes the rewrite
 * back by identity rather than by position. Position matching would silently
 * scramble a recipe the day the model returns the steps in another order.
 */
const ADAPTATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subtitle', 'description', 'ingredients', 'steps', 'notes'],
  properties: {
    title: { type: 'string' },
    subtitle: nullable('string'),
    description: nullable('string'),
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'displayName', 'note', 'substitution'],
        properties: {
          id: { type: 'string' },
          displayName: { type: 'string' },
          note: nullable('string'),
          substitution: nullable('string'),
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verb', 'instruction'],
        properties: {
          id: { type: 'string' },
          verb: { type: 'string' },
          instruction: { type: 'string' },
        },
      },
    },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'body'],
        properties: {
          id: { type: 'string' },
          title: nullable('string'),
          body: { type: 'string' },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Você adapta receitas estrangeiras para o público brasileiro no app Meu Petit Chef.

Você recebe uma receita já importada de um site estrangeiro. Devolva a MESMA
receita, escrita em português do Brasil, com os ingredientes que se encontram
num supermercado brasileiro.

REGRA ABSOLUTA — números são fatos, não texto:
Você NUNCA altera tempo, temperatura, velocidade do Thermomix, quantidade ou
unidade. Eles vieram do painel da máquina. Copie cada número exatamente como
está, inclusive dentro das frases.
- ORIGINAL: "Cuire 20 min/100°C/Vitesse Cuillère."
- CERTO:    "Cozinhe 20 min/100°C/vel. colher."
- ERRADO:   "Cozinhe 25 min/100°C/vel. colher."   ← o tempo mudou
- ERRADO:   "Cozinhe por cerca de 20 minutos."     ← perdeu os parâmetros
Mantenha a notação do Thermomix com barras: tempo/temperatura/velocidade.
"Varoma" continua "Varoma". "sens inverse" vira "sentido inverso".

NÃO MEXA NA ESTRUTURA:
- Devolva EXATAMENTE os mesmos passos, na mesma ordem, com os mesmos "id".
- Devolva EXATAMENTE os mesmos ingredientes, com os mesmos "id".
- Não junte dois passos, não divida um passo, não acrescente nem remova nada.
- Se um passo não fizer sentido, traduza mesmo assim e explique em "notes".

DEVOLVA TODOS OS INGREDIENTES, SEM EXCEÇÃO. Conte antes de responder: a lista
que sai tem o mesmo tamanho da que entrou. Os mais esquecidos são justamente os
banais — água, sal, gelo, azeite, pimenta. Água é um ingrediente: devolva
"Água". Um ingrediente que some invalida a receita inteira e ela é descartada.

INGREDIENTES — adapte ao Brasil de verdade:
- Traduza o nome para o português brasileiro do dia a dia.
- Se o produto não existir no Brasil, troque pelo equivalente real e explique em
  "substitution" (uma frase curta, em pt-BR). Exemplos do que se espera:
    crème fraîche épaisse  → creme de leite fresco   (substitution preenchido)
    gruyère râpé           → queijo prato ralado     (substitution preenchido)
    fromage blanc          → iogurte natural integral
    farine T45             → farinha de trigo comum
    échalote               → cebola roxa pequena
- Se o produto existir igual, apenas traduza e deixe "substitution" em null:
    pommes de terre → batata          (substitution: null)
    crème fraîche épaisse → creme de leite fresco  (substitution preenchido)
- NÃO escreva a quantidade dentro de "displayName": a quantidade tem coluna
  própria. "batata", não "1200 g de batata".

PASSOS:
- "verb" é OBRIGATÓRIO: UMA palavra no imperativo, em pt-BR, mostrada em
  destaque no modo cozinha. Cortar, Pesar, Adicionar, Refogar, Triturar,
  Cozinhar, Assar, Reservar, Servir.
- "instruction" é a frase, em pt-BR, com todos os números preservados.
- Se o passo original citava um ingrediente que você substituiu, use o nome
  novo na frase também.

TÍTULO E DESCRIÇÃO:
- "title": o nome do prato em pt-BR, sem citar a marca do aparelho estrangeiro
  nem o site de origem. "Gratin Dauphinois au thermomix" → "Gratinado dauphinois".
- "description": reescreva em pt-BR, curta e apetitosa (2 a 4 frases). Corte
  divagações do autor original, listas de perguntas e qualquer coisa que não
  fale da comida. Se não houver descrição aproveitável, devolva null.
- "subtitle": uma linha curta ou null.

NOTAS: traduza cada nota mantendo o "id". A nota de fonte ("Importado de …")
é traduzida mas o endereço permanece intacto.`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-api-version, x-import-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface RequestBody {
  recipe?: {
    recipeId?: string;
    sourceLanguage?: string;
    title?: string;
    subtitle?: string | null;
    description?: string | null;
    servings?: number;
    ingredients?: { id: string; displayName: string; quantity: number | null; unit: string | null; note: string | null }[];
    steps?: { id: string; verb: string | null; instruction: string }[];
    notes?: { id: string; title: string | null; body: string }[];
  };
}

/**
 * A caller is either a signed-in user or the batch importer.
 *
 * Two mechanisms, because the two callers are genuinely different:
 *
 *   * the app sends a user's access token, which is a JWT and is checked
 *     against Supabase Auth — same as `generate-recipe`;
 *   * the CLI sends a shared secret in `x-import-token`, because a batch run
 *     has no user to speak for.
 *
 * The machine path deliberately does *not* compare the caller's key against
 * `SUPABASE_SERVICE_ROLE_KEY`. Projects on the new key format hold
 * `sb_secret_…` values rather than JWTs, what the runtime injects under that
 * name varies, and the gateway may rewrite `Authorization` when an `apikey`
 * header rides along — an equality test on any of that is a coin flip. A
 * secret we set ourselves, in a header nothing else touches, is not.
 */
async function authorize(request: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const importToken = Deno.env.get('RECIPE_ADAPT_TOKEN');
  const presented = request.headers.get('x-import-token');
  if (importToken && presented && presented === importToken) return { ok: true };

  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');

  // Fallback, kept on purpose: when `RECIPE_ADAPT_TOKEN` has not been set — a
  // deploy where the secret was forgotten, or an account without the rights to
  // set one — the service key still gets a machine caller through. Without it,
  // deploying this file would silently break the batch CLI.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token && token === serviceKey) return { ok: true };

  if (!token) return { ok: false, response: json({ error: 'Faça login para adaptar receitas.' }, 401) };

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return { ok: false, response: json({ error: 'Função mal configurada.' }, 500) };
  }

  const whoami = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!whoami.ok) return { ok: false, response: json({ error: 'Sessão expirada. Entre de novo.' }, 401) };
  return { ok: true };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return json({ error: 'O serviço de adaptação ainda não foi configurado.' }, 503);

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: 'Pedido inválido.' }, 400);
  }

  const recipe = body.recipe;
  if (!recipe?.title || !recipe.steps?.length || !recipe.ingredients?.length) {
    return json({ error: 'Receita incompleta: título, ingredientes e passos são obrigatórios.' }, 400);
  }
  // A recipe far bigger than this is a parsing accident, not a recipe.
  if (recipe.steps.length > 80 || recipe.ingredients.length > 80) {
    return json({ error: 'Receita grande demais para adaptar.' }, 400);
  }

  const payload = {
    sourceLanguage: recipe.sourceLanguage ?? 'desconhecido',
    servings: recipe.servings ?? null,
    title: recipe.title,
    subtitle: recipe.subtitle ?? null,
    description: recipe.description ?? null,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    notes: recipe.notes ?? [],
  };

  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      // Low temperature on purpose: this is a translation with hard
      // constraints, not a creative task. Invention here is the failure mode.
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Idioma de origem: ${payload.sourceLanguage}.\n\nReceita:\n${JSON.stringify(payload, null, 1)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'adaptation', strict: true, schema: ADAPTATION_SCHEMA },
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('OpenAI rejected the call', upstream.status, detail.slice(0, 500));
    return json({ error: 'Não foi possível adaptar a receita agora. Tente de novo.' }, 502);
  }

  const completion = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
  const content = completion.choices?.[0]?.message?.content;
  if (!content) return json({ error: 'Resposta vazia da adaptação.' }, 502);

  let adapted: unknown;
  try {
    adapted = JSON.parse(content);
  } catch {
    return json({ error: 'A adaptação voltou num formato inesperado.' }, 502);
  }

  return json({ adapted, model: MODEL });
});
