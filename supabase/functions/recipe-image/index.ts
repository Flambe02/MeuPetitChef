/**
 * recipe-image — finds a real photo for a recipe that has none.
 *
 * "The system picks the URL itself" means searching an existing photo library,
 * not generating or hosting one: migration 16 already settled that recipe
 * photos are links, never uploads, and this keeps that promise for recipes
 * that came from the chef chat rather than an import (which inherits its
 * source's og:image and never needed this).
 *
 * Pexels was chosen because its search API is free, keyed, and returns a
 * direct, hotlinkable photo URL — no generation cost, no storage bucket.
 *
 * Pexels' own search is English-only and fairly literal — searching it with a
 * Portuguese or French recipe title ("Omelete de Batata") returns whatever
 * loosely matches "omelette", not potato specifically. A short OpenAI call
 * first turns the title into a plain English visual description ("potato
 * omelette on a plate") before it ever reaches Pexels; when no OpenAI key is
 * configured, or the call fails, the raw title is used as a fallback rather
 * than failing the whole search.
 *
 * Deploy:
 *   supabase secrets set PEXELS_API_KEY=...
 *   supabase functions deploy recipe-image
 */

const PEXELS_URL = 'https://api.pexels.com/v1/search';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const TRANSLATE_MODEL = 'gpt-4o-mini';

interface RequestBody {
  query?: string;
}

interface PexelsPhoto {
  src: { large: string; medium: string };
  alt: string | null;
}

interface PexelsResponse {
  photos?: PexelsPhoto[];
}

/** "Omelete de Batata" → "potato omelette on a plate". Best-effort: any failure
 *  here just means the raw title goes to Pexels instead, never a hard error. */
async function toSearchPhrase(openaiKey: string, title: string): Promise<string> {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TRANSLATE_MODEL,
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

  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Faça login para usar o chat.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const pexelsKey = Deno.env.get('PEXELS_API_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'Função mal configurada.' }, 500);
  // No photo is a softer failure than no recipe: a missing image search key
  // should not block saving the recipe itself, so this answers with no url
  // rather than an error the caller would have to handle specially.
  if (!pexelsKey) return json({ url: null });

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

  const query = (body.query ?? '').trim().slice(0, 200);
  if (!query) return json({ url: null });

  let searchPhrase = `${query} food dish`;
  if (openaiKey) {
    try {
      searchPhrase = await toSearchPhrase(openaiKey, query);
    } catch (error) {
      console.error('title→phrase translation failed, using raw title', error);
    }
  }

  const upstream = await fetch(
    `${PEXELS_URL}?query=${encodeURIComponent(searchPhrase)}&per_page=1&orientation=landscape`,
    { headers: { Authorization: pexelsKey } },
  );

  if (!upstream.ok) {
    console.error('Pexels rejected the call', upstream.status);
    return json({ url: null });
  }

  const payload = (await upstream.json()) as PexelsResponse;
  const photo = payload.photos?.[0];
  return json({ url: photo?.src.large ?? null });
});

export {};
