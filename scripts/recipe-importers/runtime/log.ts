/**
 * The importer's log format.
 *
 *   [IMPORT]    provider=cookomix url=https://…
 *   [FETCH]     OK status=200 bytes=135088
 *   [PARSE]     ingredients=12 steps=8
 *   [NORMALIZE] warnings=2
 *   [ERROR]     stage=parse message="Recipe instructions not found"
 *
 * One line per stage, greppable, no colour codes in the payload — a batch run
 * of four hundred URLs is read with `grep '^\[ERROR\]'`, not with the eye.
 */
export type Stage = 'IMPORT' | 'FETCH' | 'PARSE' | 'NORMALIZE' | 'VALIDATE' | 'SAVE' | 'ERROR';

const WIDTH = 11;

function format(stage: Stage, fields: Record<string, unknown>): string {
  const body = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) =>
      typeof value === 'string' && /[\s"]/.test(value)
        ? `${key}=${JSON.stringify(value)}`
        : `${key}=${String(value)}`,
    )
    .join(' ');
  return `${`[${stage}]`.padEnd(WIDTH)}${body}`;
}

export interface Logger {
  stage(stage: Stage, fields: Record<string, unknown>): void;
  line(text: string): void;
  error(stage: string, message: string): void;
}

export function createLogger(options: { quiet?: boolean } = {}): Logger {
  const quiet = options.quiet ?? false;
  return {
    stage(stage, fields) {
      if (!quiet) console.log(format(stage, fields));
    },
    line(text) {
      if (!quiet) console.log(text);
    },
    error(stage, message) {
      // Errors go to stderr even when quiet: a silent failure is the one bug a
      // batch importer must never have.
      console.error(format('ERROR', { stage, message }));
    },
  };
}

/* ── Small presentation helpers, shared by both CLIs ─────────────────────── */

export const OK = '✓';
export const WARN = '!';
export const FAIL = '✗';
