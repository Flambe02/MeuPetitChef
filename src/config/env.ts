import { z } from 'zod';

/**
 * Environment contract. Parsed once, at module load, so a missing Supabase URL
 * fails immediately with a readable message instead of surfacing as a confusing
 * network error three screens into the app.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.url({ error: 'VITE_SUPABASE_URL must be a full https URL' }),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'VITE_SUPABASE_ANON_KEY looks truncated'),
  VITE_APP_NAME: z.string().default('Meu Petit Chef'),
  VITE_DEBUG: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Configuração de ambiente inválida.\n${details}\n\n` +
      'Copie .env.example para .env.local e preencha os valores do seu projeto Supabase.',
  );
}

export const env = parsed.data;

export const isDev = import.meta.env.DEV;
