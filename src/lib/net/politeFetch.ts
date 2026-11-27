// The ONLY place allowed to call fetch() (Norma policy + ESLint rule).
// SSRF guard on every hop, manual redirects, per-host rate limits, robots.txt + per-host budget for
// target fetches, bounded streaming reads, bounded memory LRU + disk cache.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";
import type { FetchOpts, FetchResult } from "../types";
import { assertPublicUrl, BlockedUrlError } from "./guard";
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

// ---------- per-host lanes ----------
class Lane {
  private active = 0;
  private last = 0;
  private waiters: (() => void)[] = [];
  constructor(
    private readonly max: number,
    private readonly gapMs: number,
  ) {}
  async acquire(): Promise<() => void> {
    while (this.active >= this.max) await new Promise<void>((r) => this.waiters.push(r));
    this.active++; // reserve the slot before sleeping so the gap is honored in order
    const wait = this.last + this.gapMs - Date.now();
    this.last = Math.max(Date.now(), this.last + this.gapMs);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return () => {
      this.active--;
      this.waiters.shift()?.();
    };
  }
}
const lanes = new Map<string, Lane>();
function laneFor(host: string, target: boolean): Lane {
  const key = `${host}|${target ? "t" : "o"}`;
  let l = lanes.get(key);
  if (!l) {
    if (target || host === "web.archive.org") l = new Lane(1, 1000);
    else if (host === "crt.sh") l = new Lane(1, 0);
    else l = new Lane(4, 0);
    lanes.set(key, l);
  }
  return l;
}

// ---------- target budget (8 per host per 10 minutes) ----------
const budget = new Map<string, { start: number; n: number }>();
function spendTargetBudget(host: string, url: string): void {
  const now = Date.now();
  let b = budget.get(host);
  if (!b || now - b.start > 600_000) budget.set(host, (b = { start: now, n: 0 }));
  if (++b.n > 8) throw new PoliteFetchError(`target request budget (8 per 10 min) exceeded for ${host}`, url);
}

// ---------- robots.txt ----------
type Rule = { allow: boolean; path: string };
const robotsCache = new Map<string, Rule[]>();
function parseRobots(txt: string): Rule[] {
  const rules: Rule[] = [];
  let applies = false;
  let inAgents = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === "user-agent") {
      if (!inAgents) applies = false;
      inAgents = true;
      if (v === "*") applies = true;
    } else {
      inAgents = false;
      if (applies && v && (k === "disallow" || k === "allow")) rules.push({ allow: k === "allow", path: v });
    }
  }
  return rules;
}
// shortcut: robots wildcards (* and $) are not interpreted, only prefix match, upgrade if a vendor relies on them.
async function robotsAllows(u: URL): Promise<boolean> {
  const key = u.origin;
  let rules = robotsCache.get(key);
  if (!rules) {
    rules = [];
    try {
      const r = await networkFetch(`${u.origin}/robots.txt`, { timeoutMs: 5000, target: true }, false);
      if (r.status >= 200 && r.status < 300) rules = parseRobots(r.text);
    } catch {
      /* robots fetch failure = allowed */
    }
    robotsCache.set(key, rules);
  }
  const p = u.pathname + u.search;
  let best: Rule | undefined;
  for (const r of rules) {
    if (p.startsWith(r.path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

// ---------- caches ----------
const MAX_ENTRIES = 500;
const MAX_BYTES = 50 * 1024 * 1024;
const mem = new Map<string, { expires: number; size: number; result: FetchResult }>();
let memBytes = 0;
function memDelete(k: string): void {
  const e = mem.get(k);
  if (e) {
    memBytes -= e.size;
    mem.delete(k);
  }
}
function memGet(k: string): FetchResult | undefined {
  const e = mem.get(k);
  if (!e) return undefined;
  if (e.expires <= Date.now()) {
    memDelete(k);
    return undefined;
  }
  mem.delete(k); // refresh LRU position
  mem.set(k, e);
  return e.result;
}
function memSet(k: string, expires: number, result: FetchResult): void {
  memDelete(k);
  const size = result.text.length * 2 + 512;
  if (size > MAX_BYTES / 4) return;
  mem.set(k, { expires, size, result });
  memBytes += size;
  if (mem.size > MAX_ENTRIES || memBytes > MAX_BYTES) {
    const now = Date.now();
    for (const [key, e] of mem) if (e.expires <= now) memDelete(key);
    for (const key of [...mem.keys()]) {
      if (mem.size <= MAX_ENTRIES && memBytes <= MAX_BYTES) break;
      memDelete(key); // oldest first
    }
  }
}
const cacheDir = (): string => (process.env.VERCEL ? "/tmp/receipts-cache" : join(process.cwd(), ".cache", "http"));
const diskPath = (k: string): string => join(cacheDir(), createHash("sha256").update(k).digest("hex") + ".json");
async function diskGet(k: string): Promise<FetchResult | undefined> {
  try {
    const j = JSON.parse(await readFile(diskPath(k), "utf8")) as { expires: number; result: FetchResult };
    if (j.expires <= Date.now()) return undefined;
    memSet(k, j.expires, j.result);
    return j.result;
  } catch {
    return undefined;
  }
}
async function diskSet(k: string, expires: number, result: FetchResult): Promise<void> {
  try {
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(diskPath(k), JSON.stringify({ expires, result }));
  } catch {
    /* cache is best effort */
  }
}

// ---------- bounded body read ----------
// Oversized bodies are truncated at `max` (never buffered whole): a 3 MB homepage still yields its first 2 MB.
async function readCapped(res: Response, max: number, _url: string): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      chunks.push(value.subarray(0, value.byteLength - (n - max)));
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// ---------- one request, manual redirects, guard on every hop ----------
async function networkFetch(url: string, opts: FetchOpts, checkRobots: boolean): Promise<FetchResult> {
  const target = !!opts.target;
  let method = opts.method ?? "GET";
  let body = opts.body;
  let headers: Record<string, string> = { "user-agent": config.userAgent, ...opts.headers };
  let cur = url;
  for (let hop = 0; hop <= 5; hop++) {
    let u: URL;
    try {
      u = await assertPublicUrl(cur);
    } catch (e) {
      throw new PoliteFetchError(e instanceof BlockedUrlError ? e.message : String(e), url);
    }
    if (target && checkRobots) {
      if (!(await robotsAllows(u))) throw new PoliteFetchError(`blocked by robots.txt: ${cur}`, url);
      if (hop === 0) spendTargetBudget(u.hostname, url);
    }
    const release = await laneFor(u.hostname, target).acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
    try {
      const res = await fetch(cur, { method, body, headers, signal: ctrl.signal, redirect: "manual" });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel().catch(() => {});
        if (hop === 5) throw new PoliteFetchError(`too many redirects fetching ${url}`, url);
        const next = new URL(loc, cur);
        if (next.host !== u.host) {
          const { authorization: _a, cookie: _c, ...rest } = headers;
          headers = rest;
        }
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
        }
        cur = next.toString();
        ledger.record(cur);
        continue;
      }
      const text = await readCapped(res, opts.maxBytes ?? 2_000_000, cur);
      return {
        url,
        finalUrl: cur,
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
        text,
        fromCache: false,
        fetched_at: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof PoliteFetchError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new PoliteFetchError(ctrl.signal.aborted ? `timeout fetching ${url}` : msg, url);
    } finally {
      clearTimeout(timer);
      release();
    }
  }
  throw new PoliteFetchError(`too many redirects fetching ${url}`, url);
}

export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<FetchResult> {
  const method = opts.method ?? "GET";
  let ttl = opts.cacheTtlS ?? (method === "GET" ? 86400 : 0);
  if (opts.target) ttl = Math.min(ttl, 3600);
  const key = `${method} ${url} ${opts.body ?? ""} ${opts.maxBytes ?? ""}`;
  const hit = ttl > 0 ? (memGet(key) ?? (await diskGet(key))) : undefined;
  if (hit) {
    ledger.record(url);
    ledger.record(hit.finalUrl);
    return { ...hit, fromCache: true };
  }
  const result = await networkFetch(url, opts, true);
  ledger.record(url);
  ledger.record(result.finalUrl);
  if (ttl > 0 && ((result.status >= 200 && result.status < 300) || result.status === 404)) {
    const expires = Date.now() + ttl * 1000;
    memSet(key, expires, result);
    await diskSet(key, expires, result);
  }
  return result;
}
