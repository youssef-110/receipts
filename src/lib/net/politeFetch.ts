// The ONLY place allowed to call fetch() (Norma policy + ESLint rule).
// WP0 stub with the final signature: UA, timeout, size cap, memory cache, ledger.
// WP1 adds: per-host rate limits, disk cache, robots.txt for target fetches, SSRF guard.

import { config } from "../config";
import type { FetchOpts, FetchResult } from "../types";
import { ledger } from "./ledger";

export class PoliteFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = "PoliteFetchError";
  }
}

const memCache = new Map<string, { expires: number; result: FetchResult }>();

export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<FetchResult> {
  const method = opts.method ?? "GET";
  const ttl = opts.cacheTtlS ?? (method === "GET" ? 86400 : 0);
  const key = `${method} ${url} ${opts.body ?? ""}`;
  const hit = memCache.get(key);
  if (ttl > 0 && hit && hit.expires > Date.now()) {
    ledger.record(url);
    ledger.record(hit.result.finalUrl);
    return { ...hit.result, fromCache: true };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
  try {
    const res = await fetch(url, {
      method,
      body: opts.body,
      headers: { "user-agent": config.userAgent, ...opts.headers },
      signal: ctrl.signal,
      redirect: "follow",
    });
    const buf = await res.arrayBuffer();
    const max = opts.maxBytes ?? 2_000_000;
    const text = new TextDecoder().decode(buf.byteLength > max ? buf.slice(0, max) : buf);
    const result: FetchResult = {
      url,
      finalUrl: res.url || url,
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      text,
      fromCache: false,
      fetched_at: new Date().toISOString(),
    };
    ledger.record(url);
    ledger.record(result.finalUrl);
    if (ttl > 0 && res.ok) memCache.set(key, { expires: Date.now() + ttl * 1000, result });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PoliteFetchError(ctrl.signal.aborted ? `timeout fetching ${url}` : msg, url);
  } finally {
    clearTimeout(timer);
  }
}
