// WP9 marketplace helpers: URL parsing, number parsing, Evidence builder. No network here.

import type { Evidence } from "../../types";

export interface ListingRef {
  marketplace: string; // "amazon", "ebay", ...
  host: string;
  itemId: string | null;
  slugWords: string; // words from the URL path, a hint for search when the page is unreadable
}

const ID_PATTERNS: Record<string, RegExp> = {
  amazon: /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  ebay: /\/itm\/(?:[^/?#]+\/)?(\d{9,})/,
  etsy: /\/listing\/(\d+)/,
  aliexpress: /\/item\/(\d+)\.html/,
  temu: /-g-(\d+)\.html/,
  walmart: /\/ip\/(?:[^/?#]+\/)?(\d+)/,
  kaufland: /\/product\/(\d+)/,
};

export const MARKETPLACES = ["amazon", "ebay", "etsy", "aliexpress", "temu", "walmart", "otto", "kaufland", "zalando"];

export function parseListingUrl(input: string): ListingRef {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return { marketplace: "unknown", host: "", itemId: null, slugWords: "" };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const marketplace = MARKETPLACES.find((m) => host.split(".").includes(m)) ?? "unknown";
  const m = ID_PATTERNS[marketplace]?.exec(u.pathname);
  const itemId = m ? (marketplace === "amazon" ? m[1].toUpperCase() : m[1]) : null;
  const slugWords = decodeURIComponent(u.pathname)
    .split("/")
    .filter((s) => /[a-z].*-.*[a-z]/i.test(s) && s.length > 8) // "Sony-WH-1000XM5-Kopfhoerer" style segments
    .join(" ")
    .replace(/\.html$/i, "")
    .replace(/[-_]+/g, " ")
    .slice(0, 120)
    .trim();
  return { marketplace, host, itemId, slugWords };
}

/** "1.299,00 €" -> 1299, "$1,299.99" -> 1299.99, 49 -> 49. Null when no number. */
export function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = /\d[\d.,\s]*/.exec(v);
  if (!m) return null;
  let s = m[0].replace(/\s/g, "").replace(/[.,]$/, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // German decimal comma
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function slugify(s: string, max = 40): string {
  return (
    s
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, max) || "x"
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Builds one Evidence item with a stable `${collector}:${slug}` id and a claim capped at 200 chars. */
export function ev(
  collector: string,
  slug: string,
  e: Omit<Evidence, "id" | "collector" | "fetched_at"> & { fetched_at?: string },
): Evidence {
  const claim = e.claim.length > 200 ? `${e.claim.slice(0, 197)}...` : e.claim;
  return { ...e, id: `${collector}:${slug}`, collector, claim, fetched_at: e.fetched_at ?? new Date().toISOString() };
}

/** Shortens a product title to a search-friendly phrase. */
export function shortTitle(title: string, words = 8): string {
  return title
    .replace(/[()[\]{}|,;:"']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, words)
    .join(" ");
}

/** Model-number-like tokens ("WH-1000XM5", "A2337") from a title; used to match a product across pages. */
export function modelTokens(title: string): string[] {
  return [...new Set(title.split(/[\s,()/|]+/).filter((t) => t.length >= 3 && /\d/.test(t) && /[a-z]/i.test(t)))].map(
    (t) => t.toLowerCase(),
  );
}

/** True when the site's own name (label before the TLD) is the brand: sony.de, apple.com, sonyelectronics.com. Not toyota-usa.epc-data.com. */
export function isBrandHost(host: string, brandKey: string): boolean {
  const parts = host.toLowerCase().split(".");
  const twoPartTld = parts.length >= 3 && /^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2]);
  const sld = (parts[parts.length - (twoPartTld ? 3 : 2)] ?? "").replace(/-/g, "");
  return sld === brandKey || (brandKey.length >= 4 && sld.startsWith(brandKey));
}
