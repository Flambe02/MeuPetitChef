import type { PostgrestError } from '@supabase/supabase-js';

/** A Supabase failure the UI can show without leaking Postgres internals. */
export class DataError extends Error {
  readonly code: string | undefined;
  readonly status: number | undefined;

  constructor(message: string, options: { code?: string; status?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DataError';
    this.code = options.code;
    this.status = options.status;
  }
}

/** Postgres error codes worth translating rather than surfacing raw. */
const FRIENDLY: Record<string, string> = {
  '23505': 'Esse item já existe.',
  '23503': 'Não foi possível salvar: um item relacionado não existe mais.',
  '23514': 'Alguns valores não são válidos.',
  '42501': 'Você não tem permissão para isso.',
  PGRST116: 'Não encontramos esse item.',
};

/**
 * Any PostgREST response. Inferring over the *whole* response rather than over
 * its `data` field matters: PostgREST responses are discriminated unions, and
 * a `{ data: T | null }` parameter makes TypeScript collapse `T` to `never` for
 * nested selects.
 */
export type AnyPostgrestResult = { data: unknown; error: PostgrestError | null };

/**
 * Unwraps a PostgREST response. Every repository call goes through this, so
 * error handling is uniform and no call site can forget to check `error`.
 */
export function unwrap<R extends AnyPostgrestResult>(result: R): NonNullable<R['data']> {
  if (result.error) {
    const { code, message, details, hint } = result.error;
    throw new DataError(FRIENDLY[code] ?? message, {
      code,
      cause: { message, details, hint },
    });
  }
  if (result.data === null || result.data === undefined) {
    throw new DataError('Não encontramos esse item.', { code: 'PGRST116' });
  }
  return result.data;
}

/** Same, but a missing row is a legitimate `null` rather than an error. */
export function unwrapMaybe<R extends AnyPostgrestResult>(result: R): R['data'] | null {
  if (result.error) {
    // PGRST116 = "no rows returned by .single()", which is not a failure here.
    if (result.error.code === 'PGRST116') return null;
    throw new DataError(FRIENDLY[result.error.code] ?? result.error.message, {
      code: result.error.code,
      cause: result.error,
    });
  }
  return result.data;
}
