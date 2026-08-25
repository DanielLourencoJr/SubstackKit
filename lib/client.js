import { SubstackClient } from "substack-api";
import { loadDotEnv, sleep } from "./args.js";

export const UA = "Mozilla/5.0";

export const DEFAULT_PAGE_DELAY_MS = 800;
export const DEFAULT_REPLY_DELAY_MS = 1200;

/**
 * Retry a function with exponential backoff on HTTP 429.
 * Mirrors the behavior documented in docs/LIMITS.md (~1 req/s safe).
 */
export async function retryFetch(fn, retries = 8, label = "") {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const is429 = err?.response?.status === 429 || err?.status === 429;
      if (is429 && attempt < retries) {
        const delay = Math.min(2000 * 2 ** (attempt - 1), 30000);
        console.log(`  429 ${label}waiting ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Fetch JSON from a raw URL with User-Agent and 429 retry.
 * Used for public endpoints that don't go through the library client.
 */
export async function fetchJson(url, { retries = 8, label = "" } = {}) {
  return retryFetch(
    () =>
      fetch(url, { headers: { "User-Agent": UA } }).then(async (r) => {
        if (r.status === 429) {
          const e = new Error(`HTTP ${r.status}`);
          e.status = 429;
          throw e;
        }
        if (!r.ok) {
          const e = new Error(`HTTP ${r.status}`);
          e.status = r.status;
          throw e;
        }
        return r.json();
      }),
    retries,
    label
  );
}

export async function fetchText(url, label = "") {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (resp.status === 429) throw new Error(`HTTP 429 (${label})`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} (${label})`);
  return resp.text();
}

/**
 * Create the SubstackClient from a SID token. `substackClient`/`publicationClient`
 * are the raw HttpClients used to hit platform/publication endpoints directly.
 */
export function createClient({ token, publicationUrl = "substack.com" }) {
  return new SubstackClient({ token, publicationUrl });
}

/**
 * Load a token from an env file (or fall back to process env) and build a client.
 * `envFile` may be a path; missing files are tolerated.
 */
export function clientFromEnv({ envFile, token } = {}) {
  if (envFile) loadDotEnv(envFile);
  const sid = token || process.env.SUBSTACK_SID;
  if (!sid) {
    throw new Error(
      "SUBSTACK_SID missing. Set it in .env, export the variable, or pass --token."
    );
  }
  return createClient({ token: sid });
}

export function tokenFromEnv({ envFile, token } = {}) {
  if (envFile) loadDotEnv(envFile);
  return token || process.env.SUBSTACK_SID || "";
}
