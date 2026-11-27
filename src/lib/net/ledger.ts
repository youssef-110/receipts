import { AsyncLocalStorage } from "node:async_hooks";

// Run ledger: every URL this run actually fetched ("fetched") or only saw in search results ("seen").
// The validator uses it so the verdict can only cite sources we really touched.

type Entry = "fetched" | "seen";
interface LedgerStore {
  urls: Map<string, Entry>;
  aliases: Map<string, string>; // display URL -> fetched (API) URL
}

const als = new AsyncLocalStorage<LedgerStore>();

export function normalizeForLedger(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    x.hostname = x.hostname.toLowerCase().replace(/^www\./, "");
    return x.toString().replace(/\/$/, "");
  } catch {
    return u.trim();
  }
}

export function withLedger<T>(fn: () => Promise<T>): Promise<T> {
  return als.run({ urls: new Map(), aliases: new Map() }, fn);
}

export const ledger = {
  /** We fetched this URL ourselves. */
  record(url: string): void {
    als.getStore()?.urls.set(normalizeForLedger(url), "fetched");
  },
  /** URL only appeared in a search result (not fetched). Never downgrades a fetched URL. */
  seen(url: string, _via?: string): void {
    const s = als.getStore();
    const k = normalizeForLedger(url);
    if (s && !s.urls.has(k)) s.urls.set(k, "seen");
  },
  /** A human-openable URL backed by an API URL we fetched (e.g. crt.sh page vs crt.sh JSON). */
  alias(displayUrl: string, fetchedUrl: string): void {
    const s = als.getStore();
    if (!s) return;
    s.aliases.set(normalizeForLedger(displayUrl), normalizeForLedger(fetchedUrl));
    s.urls.set(normalizeForLedger(displayUrl), "fetched");
  },
  has(url: string): Entry | false {
    return als.getStore()?.urls.get(normalizeForLedger(url)) ?? false;
  },
  size(): number {
    return als.getStore()?.urls.size ?? 0;
  },
};
