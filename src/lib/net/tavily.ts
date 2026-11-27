// Tavily client (search + extract) over politeFetch. WP1 may harden; keep signatures.

import { config } from "../config";
import { ledger } from "./ledger";
import { politeFetch } from "./politeFetch";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}
export interface TavilySearchResponse {
  results: TavilyResult[];
  images: { url: string; description?: string }[];
}
export interface TavilySearchOpts {
  include_domains?: string[];
  exclude_domains?: string[];
  topic?: "general" | "news";
  include_images?: boolean;
  max_results?: number;
  exact_match?: boolean;
  search_depth?: "basic" | "advanced";
}
export interface TavilyExtracted {
  url: string;
  raw_content: string;
  images?: string[];
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  if (!config.tavilyKey) throw new Error("TAVILY_API_KEY missing");
  const res = await politeFetch(`https://api.tavily.com/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.tavilyKey}` },
    body: JSON.stringify(body),
    timeoutMs,
    cacheTtlS: 86400, // same query in the same day = same answer, saves credits and makes reruns stable
  });
  if (!res.ok) throw new Error(`Tavily ${path} HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  return JSON.parse(res.text) as T;
}

export async function search(q: string, opts: TavilySearchOpts = {}): Promise<TavilySearchResponse> {
  const data = await post<{ results?: TavilyResult[]; images?: (string | { url: string; description?: string })[] }>(
    "search",
    { query: q, max_results: opts.max_results ?? 5, search_depth: opts.search_depth ?? "basic", ...opts },
    20000,
  );
  const results = data.results ?? [];
  for (const r of results) ledger.seen(r.url, "tavily.search");
  const images = (data.images ?? []).map((i) => (typeof i === "string" ? { url: i } : i));
  return { results, images };
}

export async function extract(urls: string[]): Promise<TavilyExtracted[]> {
  if (urls.length === 0) return [];
  const data = await post<{ results?: TavilyExtracted[] }>("extract", { urls }, 30000);
  const results = data.results ?? [];
  for (const r of results) ledger.record(r.url);
  return results;
}
