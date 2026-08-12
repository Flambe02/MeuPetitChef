import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';
import { DataError } from '@/lib/supabase/errors';

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new DataError(error.message, { cause: error });
  return data.session;
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new DataError(translateAuthError(error.message), { cause: error });
  return data.session;
}

export async function signUpWithPassword(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: displayName ? { data: { full_name: displayName } } : undefined,
  });
  if (error) throw new DataError(translateAuthError(error.message), { cause: error });
  return data;
}

/** Magic link — the friendliest option on a phone, no password to remember. */
export async function signInWithOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // `BASE_URL`, not "/": on GitHub Pages the app lives under /<repo>/, and a
    // magic link pointing at the domain root would land outside it.
    options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
  });
  if (error) throw new DataError(translateAuthError(error.message), { cause: error });
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new DataError(error.message, { cause: error });
}

function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('already registered')) return 'Esse e-mail já tem uma conta.';
  if (message.includes('Password should be')) return 'A senha precisa de pelo menos 6 caracteres.';
  if (message.includes('rate limit')) return 'Muitas tentativas. Tente de novo em alguns minutos.';
  return message;
}
