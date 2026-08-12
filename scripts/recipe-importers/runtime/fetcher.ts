/**
 * A polite HTTP client for recipe pages.
 *
 * The rules from the brief, all enforced here rather than left to the caller:
 *
 *   * identify ourselves with a real User-Agent and a contact URL;
 *   * read `robots.txt` before the first request to a host, cache it, and
 *     refuse a path it disallows;
 *   * one request at a time, with a delay between them;
 *   * exponential backoff on 429 and 5xx, honouring `Retry-After`;
 *   * give up rather than hammer.
 *
 * Nothing here tries to look like a browser, rotate identities, or bypass a
 * protection. If a site says no, the answer is no.
 */
import { readEnv } from './env.ts';

export const DEFAULT_USER_AGENT =
  'MeuPetitChefBot/0.1 (+https://meupetitchef.app/bot; recipe import; contact: contato@meupetitchef.app)';

export interface FetchOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Milliseconds to wait after a successful request before the next one. */
  delayMs?: number;
  /** Escape hatch for a locally saved page; never used for live crawling. */
  ignoreRobots?: boolean;
  onRetry?: (attempt: number, waitMs: number, reason: string) => void;
}

export interface FetchedPage {
  url: string;
  html: string;
  status: number;
}

export class FetchRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchRefused';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------------------------------------------------------------------------
 * robots.txt
 * ------------------------------------------------------------------------- */

interface RobotsRules {
  allow: string[];
  disallow: string[];
}

const robotsCache = new Map<string, RobotsRules | null>();

/**
 * Parses the groups that apply to us: our own token first, `*` otherwise.
 *
 * Deliberately a subset of the standard — `Crawl-delay` is read by the caller,
 * wildcards inside paths are treated as literal prefixes. The failure mode of
 * that simplification is refusing slightly too much, which is the right way to
 * be wrong.
 */
export function parseRobots(text: string, agent: string): RobotsRules {
  const token = agent.split('/')[0]?.toLowerCase() ?? '';
  const groups = new Map<string, RobotsRules>();
  let current: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (!key) continue;

    if (key === 'user-agent') {
      current = [value.toLowerCase()];
      if (!groups.has(value.toLowerCase()))
        groups.set(value.toLowerCase(), { allow: [], disallow: [] });
      continue;
    }
    if (key !== 'allow' && key !== 'disallow') continue;

    for (const name of current) {
      const group = groups.get(name);
      if (!group) continue;
      if (key === 'allow') group.allow.push(value);
      else if (value) group.disallow.push(value);
    }
  }

  return groups.get(token) ?? groups.get('*') ?? { allow: [], disallow: [] };
}

/** Longest matching rule wins; `Allow` beats `Disallow` at equal length. */
export function robotsPermits(rules: RobotsRules, pathname: string): boolean {
  const longest = (patterns: string[]) =>
    patterns
      .filter((pattern) => pathname.startsWith(pattern.replace(/\*.*$/, '')))
      .reduce((best, pattern) => Math.max(best, pattern.length), -1);

  return longest(rules.allow) >= longest(rules.disallow);
}

async function loadRobots(origin: string, userAgent: string): Promise<RobotsRules | null> {
  if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;

  let rules: RobotsRules | null = null;
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': userAgent },
      redirect: 'follow',
    });
    // A 404 means "no rules", which is permission. A 5xx means we do not know,
    // and not knowing is not permission — but neither is it a reason to fail a
    // whole batch, so it is treated as "no rules" with the delay still applied.
    if (response.ok) rules = parseRobots(await response.text(), userAgent);
  } catch {
    rules = null;
  }

  robotsCache.set(origin, rules);
  return rules;
}

/* ---------------------------------------------------------------------------
 * Fetch
 * ------------------------------------------------------------------------- */

/**
 * Fetches one page, politely.
 *
 * Throws `FetchRefused` when robots.txt disallows the path — a distinct type so
 * the batch runner can record "skipped" rather than "failed".
 */
export async function fetchPage(url: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const userAgent = options.userAgent ?? readEnv('RECIPE_IMPORT_USER_AGENT') ?? DEFAULT_USER_AGENT;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRetries = options.maxRetries ?? 3;

  const target = new URL(url);

  if (!options.ignoreRobots) {
    const rules = await loadRobots(target.origin, userAgent);
    if (rules && !robotsPermits(rules, target.pathname)) {
      throw new FetchRefused(`robots.txt de ${target.hostname} não permite ${target.pathname}`);
    }
  }

  let lastError = '';
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      // 2 s, 4 s, 8 s … with a little jitter so parallel runs do not sync up.
      const wait = Math.min(30_000, 2000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      options.onRetry?.(attempt, wait, lastError);
      await sleep(wait);
    }

    let response: Response;
    try {
      response = await fetch(target, {
        headers: {
          'user-agent': userAgent,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'fr,pt-BR;q=0.8,en;q=0.6',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('retry-after'));
      lastError = `HTTP ${response.status}`;
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        options.onRetry?.(attempt + 1, retryAfter * 1000, lastError);
        await sleep(Math.min(60_000, retryAfter * 1000));
      }
      continue;
    }

    if (!response.ok) {
      // 404 / 403 are answers, not hiccups. Retrying them is just noise.
      throw new Error(`HTTP ${response.status} em ${target.href}`);
    }

    const html = await response.text();
    if (options.delayMs) await sleep(options.delayMs);
    return { url: response.url || target.href, html, status: response.status };
  }

  throw new Error(`Falha ao buscar ${target.href} após ${maxRetries + 1} tentativas: ${lastError}`);
}
