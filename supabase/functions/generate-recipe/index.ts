/**
 * generate-recipe — the only place the OpenAI key is allowed to exist.
 *
 * Anything prefixed `VITE_` ends up in the browser bundle, so calling OpenAI
 * from the client would hand the key to whoever opens devtools. This function
 * holds the secret, proves who the caller is from their Supabase JWT, and
 * returns a recipe in the exact shape `recipes` + `cooking_paths` +
 * `cooking_steps` expect — so the landscape cook screens can render it with no
 * special-casing.
 *
 * Deploy:
 *   supabase secrets set OPENAI_API_KEY=sk-...
 *   supabase functions deploy generate-recipe
 *
 * The client never sees the key, and an unauthenticated call is rejected before
 * a single token is spent.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

/** Mirrors the enums in migration 00. Keep in step with `equipment_type`. */
const EQUIPMENT = [
  'air_fryer',
  'oven',
  'stovetop',
  'thermomix',
  'microwave',
  'blender',
  'pressure_cooker',
  'electric_cooker',
  'barbecue',
  'sous_vide',
  'other',
  'none',
] as const;

const DIAL_KINDS = ['tempo', 'temperatura', 'velocidade', 'potencia', 'alerta', 'modo'] as const;

/**
 * The response contract.
 *
 * Structured Outputs in `strict` mode has one rule that bites immediately:
 * *every* key in `properties` must also appear in `required`, and every object
 * must set `additionalProperties: false`. An optional field is therefore
 * expressed as a nullable union — `['string', 'null']` — never by leaving it
 * out of `required`. Omitting them makes the API reject the whole request with
 * a 400 before a single token is generated.
 */
const nullable = (type: string) => ({ type: [type, 'null'] });

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'subtitle',
    'description',
    'total_minutes',
    'active_minutes',
    'servings',
    'difficulty',
    'nutrition',
    'ingredients',
    'paths',
  ],
  properties: {
    title: { type: 'string' },
    subtitle: nullable('string'),
    description: { type: 'string' },
    total_minutes: { type: 'integer' },
    active_minutes: nullable('integer'),
    servings: { type: 'integer' },
    difficulty: { type: 'string', enum: ['facil', 'medio', 'dificil'] },
    nutrition: {
      type: 'object',
      additionalProperties: false,
      required: ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'],
      properties: {
        kcal: nullable('number'),
        protein_g: nullable('number'),
        carbs_g: nullable('number'),
        fat_g: nullable('number'),
        fiber_g: nullable('number'),
      },
    },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['group', 'display_name', 'quantity', 'unit', 'unit_kind', 'note'],
        properties: {
          group: nullable('string'),
          display_name: { type: 'string' },
          quantity: nullable('number'),
          unit: nullable('string'),
          unit_kind: {
            type: 'string',
            enum: ['mass', 'volume', 'count', 'spoon', 'pinch', 'to_taste'],
          },
          note: nullable('string'),
        },
      },
    },
    paths: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'reason', 'total_minutes', 'required_equipment', 'steps'],
        properties: {
          name: { type: 'string' },
          reason: nullable('string'),
          total_minutes: nullable('integer'),
          required_equipment: { type: 'array', items: { type: 'string', enum: EQUIPMENT } },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'verb',
                'instruction',
                'equipment',
                'duration_seconds',
                'alert_text',
                'dials',
              ],
              properties: {
                verb: nullable('string'),
                instruction: { type: 'string' },
                equipment: { type: 'string', enum: EQUIPMENT },
                duration_seconds: nullable('integer'),
                alert_text: nullable('string'),
                dials: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind', 'value_num', 'value_text', 'sub_label'],
                    properties: {
                      kind: { type: 'string', enum: DIAL_KINDS },
                      value_num: nullable('number'),
                      value_text: nullable('string'),
                      sub_label: nullable('string'),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Você é o chef do Meu Petit Chef, um app brasileiro de receitas guiadas.

O modo cozinha mostra UMA etapa por vez, em tela cheia, para alguém de pé na
cozinha com as mãos ocupadas. Essa pessoa NÃO pode voltar para conferir a lista
de ingredientes. Escreva no padrão Cookidoo / Thermomix.

REGRA MAIS IMPORTANTE — a quantidade vive na etapa, nunca só na lista:
- ERRADO: "Adicione a cebola e o alho no copo."
- CERTO:  "Coloque 1 cebola (100 g) cortada em quatro e 2 dentes de alho no copo."
Toda etapa que usa um ingrediente repete o nome E a quantidade, com o peso entre
parênteses quando fizer sentido. Repetir é obrigatório, não redundante.

SEPARE O PREPARO DO COZIMENTO:
- Cortar, descascar, temperar, pesar são etapas próprias, antes de ir ao aparelho.
- ERRADO: "Refogue a cebola picada com o frango temperado."
- CERTO, em três etapas:
    1. "Descasque 1 cebola (100 g) e corte em cubos pequenos."
    2. "Tempere 500 g de peito de frango em cubos com 1 colher de chá de sal e pimenta."
    3. "Coloque a cebola no copo." + dials tempo/velocidade
- Diga também o que fazer com o resultado: "Retire para uma tigela e reserve."

"verb" É OBRIGATÓRIO em toda etapa — nunca null. É UMA palavra no imperativo,
mostrada em destaque no alto da tela: Descascar, Cortar, Temperar, Adicionar,
Refogar, Triturar, Cozinhar, Assar, Gratinar, Misturar, Retirar, Servir.
O verbo NÃO se repete dentro de "instruction": o verbo diz o gesto, a instrução
diz com o quê e quanto.
- ERRADO: verb=null, instruction="Descasque 1 cebola (100 g) e corte em cubos."
- CERTO:  verb="Descascar", instruction="1 cebola (100 g), cortada em cubos pequenos."

UMA ETAPA = UMA AÇÃO. Se a frase tem "e depois", são duas etapas.
Uma receita bem escrita tem tipicamente 8 a 18 etapas. Poucas etapas longas é o
erro mais comum — prefira muitas etapas curtas.

TÉCNICA THERMOMIX — respeite a ordem, senão a receita queima ou empapa:
1. Picar a seco primeiro: alho, cebola, ervas vão ao copo ANTES da gordura,
   picados em velocidade alta e curta (3-5 seg / vel 5-7), depois raspa-se as
   paredes com a espátula.
2. SÓ ENTÃO o azeite ou a manteiga, e só então refoga-se:
   normalmente 3-5 min / 120 °C (Varoma) / vel 1.
   Refogar sem gordura no copo é erro: agarra no fundo e queima.
3. Cozimentos longos ou com pedaços: vel 1 ou colher inversa, para não triturar.
4. Coisas delicadas — ervilhas, ovos mexidos, peixe — em vel 1 ou borboleta,
   tempo curto. Ervilha em velocidade alta vira purê.
5. Líquido suficiente para cobrir as lâminas em qualquer cozimento longo.
6. Terminar com "Retire para uma travessa" ou "Sirva no próprio copo".

UM ÚNICO APARELHO significa UM ÚNICO APARELHO. Se a pessoa declarou só Thermomix,
todas as etapas de cocção acontecem no copo — nada de frigideira, panela ou forno.
Tigelas, pratos e espátula não são aparelhos e podem ser usados livremente.

DIALS — o número vai em "value_num" ou "value_text", NUNCA só em "sub_label":
  tempo:        value_num = 300   value_text = "05:00"   sub_label = "min · seg"
                (value_num SEMPRE em segundos)
  temperatura:  value_num = 180   value_text = "180 °C"  sub_label = null
  velocidade:   value_num = 5     value_text = "5"       sub_label = "Nível"
  potencia:     value_text = "Médio"                     sub_label = "Nível 6/9"
Um dial sem valor aparece vazio na tela e não serve para nada. "sub_label" é só
a legenda pequena embaixo, nunca o valor.
NUNCA repita o mesmo "kind" duas vezes na mesma etapa: um dial por tipo.

QUAL DIAL PARA QUAL APARELHO — errar aqui deixa a receita impossível de executar:
  air_fryer:  tempo + temperatura em °C. SEMPRE. Uma air fryer se regula em
              graus, tipicamente 160-200 °C — ela NÃO tem níveis de potência.
              ERRADO:  potencia = "Médio", sub_label = "Nível 6/9"
              CERTO:   temperatura value_num = 180, value_text = "180 °C"
              Diga a temperatura também na frase: "Asse a 180 °C por 15 min."
  forno:      tempo + temperatura em °C, e avise o preaquecimento.
  thermomix:  tempo + velocidade, e temperatura quando aquece.
  micro-ondas: tempo + potencia — é o único aparelho com níveis de potência.
  fogão:      tempo + potencia ("Baixo", "Médio", "Alto") — a boca não tem graus.
  none:       sem dials.

Toda etapa que liga um aparelho preenche "dials".

"duration_seconds" da etapa deve bater com o dial de tempo — é ele que dispara o
cronômetro do modo cozinha.

ALERTAS: use "alert_text" para o que dá errado — "Não deixe dourar demais",
"Prove o sal antes de servir".

NO THERMOMIX, o peso é obrigatório TODA VEZ que algo entra no copo — inclusive
quando o ingrediente já foi citado numa etapa anterior. NUNCA use artigo
definido sozinho ("o frango", "a berinjela") numa etapa que enche o copo.
- ERRADO: "Coloque a cebola cortada no copo da Thermomix."
- ERRADO: "Adicione o frango temperado no copo."      ← já citado antes não isenta
- ERRADO: "Coloque a berinjela cortada no copo."
- CERTO:  "Coloque 1 cebola (100 g) cortada em quatro no copo."
- CERTO:  "Adicione os 300 g de frango temperado no copo."
- CERTO:  "Coloque os 200 g de berinjela em cubos no copo."
Quem cozinha está pesando na balança do aparelho e NÃO pode voltar atrás para
conferir. Repita o número mesmo que pareça redundante — é o ponto todo.

UM CAMINHO POR CONJUNTO DE APARELHOS, nunca dois parecidos:
- Se a pessoa declarou só Thermomix, devolva EXATAMENTE UM caminho.
- Dois caminhos só se usarem aparelhos realmente diferentes ("Thermomix + Forno"
  contra "Fogão + Air Fryer"). Nomeie cada um pelos aparelhos, não pelo prato:
  "Thermomix + Forno", não "Preparar Ovos com Ervilhas".
- Dois caminhos com os mesmos aparelhos e o mesmo tempo são um erro: escolha o melhor.

OUTRAS REGRAS:
- Responda SEMPRE em português do Brasil, INCLUSIVE quando o pedido vier em
  outro idioma. Traduza tudo: título, ingredientes, passos. Nenhuma palavra
  estrangeira sobra — "crevettes" é camarão, "poulet" é frango, "courgette" é
  abobrinha. Um título como "Crevettes com Legumes" é erro.
- Use APENAS os equipamentos declarados. Se a pessoa não tem forno, nenhuma etapa vai ao forno.
- Cada "path" é executável do início ao fim com esses equipamentos.
- Quantidades realistas e coerentes com o número de porções pedido.
- Se o pedido for perigoso, sem sentido culinário ou não for sobre comida, devolva
  o título "Não consegui" e um único caminho com uma etapa explicando por quê.

Ajuste ao chef escolhido:
- normal: equilibrado, do dia a dia.
- gourmand: mais generoso, mais sabor, sem culpa.
- fit: mais leve, mais proteína, menos gordura — sem virar dieta triste.`;

interface RequestBody {
  prompt?: string;
  equipment?: string[];
  mode?: string;
  servings?: number;
  /** Prior turns, for refinement. */
  turns?: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * `x-application-name` is there because the app's Supabase client sets it
 * globally (see `src/lib/supabase/client.ts`), so it rides on every request
 * including this one. A header the browser sends but the preflight does not
 * allow kills the call before it leaves the machine — with an error that names
 * CORS rather than the header, which is why it is worth spelling out here.
 */
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

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  // ── Who is asking ────────────────────────────────────────────────────────
  // Verified against Supabase Auth before any token is spent: an open proxy
  // would be someone else's bill.
  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Faça login para usar o chat.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Função mal configurada.' }, 500);
  if (!openaiKey) {
    return json({ error: 'O serviço de receitas ainda não foi configurado.' }, 503);
  }

  const whoami = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
  });
  if (!whoami.ok) return json({ error: 'Sessão expirada. Entre de novo.' }, 401);

  // ── What they asked ──────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: 'Pedido inválido.' }, 400);
  }

  const prompt = (body.prompt ?? '').trim();
  if (prompt.length < 3) return json({ error: 'Diga o que você quer cozinhar.' }, 400);
  if (prompt.length > 2000) return json({ error: 'Pedido longo demais.' }, 400);

  const equipment = (body.equipment ?? []).filter((item) =>
    (EQUIPMENT as readonly string[]).includes(item),
  );
  const mode = ['normal', 'gourmand', 'fit'].includes(body.mode ?? '') ? body.mode : 'normal';
  const servings = Math.min(20, Math.max(1, Math.round(body.servings ?? 2)));
  const turns = (body.turns ?? []).slice(-8);

  const context = [
    `Equipamentos disponíveis: ${equipment.length > 0 ? equipment.join(', ') : 'nenhum declarado — use apenas fogão e bancada'}.`,
    `Chef: ${mode}.`,
    `Porções: ${servings}.`,
  ].join('\n');

  // ── Ask ──────────────────────────────────────────────────────────────────
  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: context },
        ...turns,
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'recipe', strict: true, schema: RECIPE_SCHEMA },
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('OpenAI rejected the call', upstream.status, detail.slice(0, 500));
    // The upstream error is logged, never forwarded: it can carry key hints.
    return json({ error: 'O chef não conseguiu responder agora. Tente de novo.' }, 502);
  }

  const payload = (await upstream.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return json({ error: 'Resposta vazia do chef.' }, 502);

  let recipe: unknown;
  try {
    recipe = JSON.parse(content);
  } catch {
    return json({ error: 'O chef respondeu num formato inesperado.' }, 502);
  }

  return json({ recipe });
});

// Deno loads every file as a module; saying so lets one `tsc` pass check all
// three functions without them colliding in a shared global scope.
export {};
