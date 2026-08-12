/**
 * Just enough Deno for `npm run typecheck:functions`.
 *
 * The Edge Functions run on Deno and are deployed straight from source — no
 * build step, so nothing was ever compiled before it went live. A duplicate
 * `const` inside one function cost a deploy round trip and a `BOOT_ERROR` in
 * production, which is a parse error any compiler catches in a second.
 *
 * The alternative was installing the real Deno toolchain into a project that
 * otherwise needs only Node. This file is the cheap 90 %: it declares the two
 * globals the functions actually touch, so `tsc` can read them.
 */
declare namespace Deno {
  export const env: {
    get(key: string): string | undefined;
  };

  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
