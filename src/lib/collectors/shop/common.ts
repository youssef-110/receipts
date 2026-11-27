// WP8 shop helpers shared by the shop collectors: evidence builder, product identification (memoized per run).

import { parse } from "node-html-parser";
import { ledger } from "../../net/ledger";
import { politeFetch } from "../../net/politeFetch";
import type { Evidence, RunCtx } from "../../types";

type EvOpts = Omit<Evidence, "id" | "collector" | "fetched_at" | "claim"> & { fetched_at?: string };

export function ev(collector: string, slug: string, claim: string, o: EvOpts): Evidence {
  return {
    id: `${collector}:${slug}`,
    collector,
    claim: claim.length > 200 ? `${claim.slice(0, 197)}...` : claim,
    fetched_at: o.fetched_at ?? new Date().toISOString(),
    ...o,
  };
}

export interface ShopProduct {
  title: string;
  url: string; // human-openable product (or shop) page
  images: string[];
  price: number | null;
  currency: string | null;
  createdAt: string | null; // Shopify created_at of this product
  catalogNewest: string | null; // newest/oldest created_at among the sampled Shopify catalog
  catalogOldest: string | null;
  catalogCount: number;
  source: string; // where the product data came from
  jsonUrl: string | null; // Shopify JSON we fetched (aliased to url)
}

export const isShopify = (html: string): boolean => /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html);

export function absUrl(u: string | undefined | null, base: string): string | null {
  if (!u) return null;
  try {
    return new URL(u.startsWith("//") ? `https:${u}` : u, base).toString();
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Walks JSON-LD (arrays, @graph) and returns the first object whose @type includes Product. */
export function findLdProduct(ld: unknown): Record<string, unknown> | null {
  const stack: unknown[] = [ld];
  while (stack.length) {
    const x = stack.shift();
    if (Array.isArray(x)) stack.push(...x);
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const t = o["@type"];
      if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return o;
      if (o["@graph"]) stack.push(o["@graph"]);
    }
  }
  return null;
}

interface PageProduct {
  title: string | null;
  images: string[];
  price: number | null;
  currency: string | null;
}

/** Product facts from JSON-LD Product, falling back to og:/product: meta. */
export function productFromPage(jsonLd: unknown[], meta: Record<string, string>, base: string): PageProduct {
  const p = findLdProduct(jsonLd);
  const imgs: string[] = [];
  let price: number | null = null;
  let currency: string | null = null;
  let title: string | null = null;
  if (p) {
    title = typeof p.name === "string" ? p.name : null;
    const im = p.image;
    for (const i of Array.isArray(im) ? im : [im]) {
      const u = absUrl(typeof i === "string" ? i : (i as { url?: string } | null)?.url, base);
      if (u) imgs.push(u);
    }
    const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
    if (offers && typeof offers === "object") {
      const o = offers as Record<string, unknown>;
      price = num(o.price ?? o.lowPrice);
      currency = typeof o.priceCurrency === "string" ? o.priceCurrency : null;
    }
  }
  title ??= meta["og:title"] ?? null;
  const og = absUrl(meta["og:image:secure_url"] ?? meta["og:image"], base);
  if (og && !imgs.includes(og)) imgs.push(og);
  price ??= num(meta["product:price:amount"] ?? meta["og:price:amount"]);
  currency ??= meta["product:price:currency"] ?? meta["og:price:currency"] ?? null;
  return { title, images: imgs.slice(0, 4), price, currency };
}

interface ShopifyProduct {
  title?: string;
  handle?: string;
  created_at?: string;
  images?: { src?: string }[];
  variants?: { price?: string }[];
}

const shopifyCurrency = (html: string): string | null =>
  /Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/.exec(html)?.[1] ?? null;

const memo = new Map<string, Promise<ShopProduct | null>>();

/** Identifies the product under test once per run (shared by shop-product and shop-dropship). <=1 target fetch. */
export function getProduct(ctx: RunCtx): Promise<ShopProduct | null> {
  let p = memo.get(ctx.runId);
  if (!p) {
    p = identify(ctx).catch(() => null);
    memo.set(ctx.runId, p);
    if (memo.size > 50) memo.delete(memo.keys().next().value as string);
  }
  return p;
}

async function identify(ctx: RunCtx): Promise<ShopProduct | null> {
  const s = ctx.site;
  if (!s.html) return null;
  const origin = new URL(s.finalUrl).origin;
  const page = productFromPage(s.jsonLd, s.meta, s.finalUrl);
  const base: ShopProduct = {
    title: page.title ?? "",
    url: s.finalUrl,
    images: page.images,
    price: page.price,
    currency: page.currency,
    createdAt: null,
    catalogNewest: null,
    catalogOldest: null,
    catalogCount: 0,
    source: "product page JSON-LD/meta",
    jsonUrl: null,
  };
  const onProductPage = !!findLdProduct(s.jsonLd) || /\/products?\/[^/]+/.test(new URL(s.finalUrl).pathname);

  if (isShopify(s.html)) {
    const handle = /\/products\/([^/?#]+)/.exec(new URL(s.finalUrl).pathname)?.[1];
    const jsonUrl = handle ? `${origin}/products/${handle}.json` : `${origin}/products.json?limit=5`;
    const res = await politeFetch(jsonUrl, { target: true, timeoutMs: 10000 }).catch(() => null);
    if (res?.ok) {
      let list: ShopifyProduct[] = [];
      try {
        const data = JSON.parse(res.text) as { product?: ShopifyProduct; products?: ShopifyProduct[] };
        list = data.product ? [data.product] : (data.products ?? []);
      } catch {
        list = [];
      }
      const first = list[0];
      if (first) {
        const dates = list.map((x) => x.created_at).filter((d): d is string => !!d && !isNaN(Date.parse(d)));
        dates.sort((a, b) => Date.parse(a) - Date.parse(b));
        const url = handle ? s.finalUrl : first.handle ? `${origin}/products/${first.handle}` : s.finalUrl;
        ledger.alias(url, jsonUrl);
        const imgs = (first.images ?? []).map((i) => absUrl(i.src, origin)).filter((u): u is string => !!u);
        return {
          title: (handle && base.title) || first.title || base.title,
          url,
          images: handle && base.images.length ? base.images : imgs.slice(0, 4),
          price: (handle && base.price) || num(first.variants?.[0]?.price),
          currency: base.currency ?? shopifyCurrency(s.html),
          createdAt: first.created_at ?? null,
          catalogNewest: dates.at(-1) ?? null,
          catalogOldest: dates[0] ?? null,
          catalogCount: list.length,
          source: "Shopify product JSON",
          jsonUrl,
        };
      }
    }
  }

  if (onProductPage || base.price) return base.title ? base : null;

  // Homepage of a non-Shopify shop: follow the first product-looking internal link (1 target fetch).
  const link = s.links.find((l) => l.internal && /\/(products?|produkt|p|item|artikel|shop)\/[^/?#]{3,}/i.test(new URL(l.href).pathname));
  if (!link) return null;
  const res = await politeFetch(link.href, { target: true, timeoutMs: 10000 }).catch(() => null);
  if (!res?.ok) return null;
  const root = parse(res.text);
  const meta: Record<string, string> = {};
  for (const m of root.querySelectorAll("meta")) {
    const k = m.getAttribute("property") ?? m.getAttribute("name");
    const v = m.getAttribute("content");
    if (k && v) meta[k.toLowerCase()] = v;
  }
  const ld = root.querySelectorAll('script[type="application/ld+json"]').flatMap((x) => {
    try {
      return [JSON.parse(x.text) as unknown];
    } catch {
      return [];
    }
  });
  const pp = productFromPage(ld, meta, res.finalUrl);
  if (!pp.title) return null;
  return { ...base, ...pp, title: pp.title, url: res.finalUrl, source: "linked product page JSON-LD/meta" };
}

/** Product title without brand fluff, for marketplace search. */
export function cleanTitle(title: string, brand: string): string {
  let t = title.split(/\s[|–—]\s|\s-\s/)[0] ?? title;
  if (brand.length > 2) t = t.replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  t = t
    .replace(/[™®©]/g, " ")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\b(original|official|premium|new|neu|sale|limited|edition|bestseller|hot|20\d\d|\d+%\s*off)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.split(" ").slice(0, 8).join(" ");
}

// shortcut: static FX to USD, fine for a >=3x markup threshold; upgrade to a rates API if ratios near 3x matter.
const TO_USD: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.13, CAD: 0.73, AUD: 0.66, SEK: 0.095, PLN: 0.25, DKK: 0.145 };
export const toUsd = (amount: number, currency: string | null): number | null => {
  const r = TO_USD[(currency ?? "").toUpperCase()];
  return r ? amount * r : null;
};

/** Lowest USD-comparable price mentioned in a marketplace snippet ("US $3.20", "€4,99", "12.50 EUR"). */
export function lowestPriceUsd(text: string): number | null {
  const found: number[] = [];
  const pats: [RegExp, string][] = [
    [/(?:US\s?\$|USD\s?|\$)\s?(\d{1,5}(?:[.,]\d{1,2})?)/g, "USD"],
    [/(?:€|EUR\s?)\s?(\d{1,5}(?:[.,]\d{1,2})?)/g, "EUR"],
    [/(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:€|EUR\b)/g, "EUR"],
    [/(?:£|GBP\s?)\s?(\d{1,5}(?:[.,]\d{1,2})?)/g, "GBP"],
  ];
  for (const [re, cur] of pats) {
    for (const m of text.matchAll(re)) {
      const v = toUsd(parseFloat((m[1] ?? "").replace(",", ".")), cur);
      if (v !== null && v >= 0.3) found.push(v);
    }
  }
  return found.length ? Math.min(...found) : null;
}

const STOP = new Set(["men", "mens", "women", "womens", "for", "and", "with", "the", "new", "set", "pcs", "kids", "unisex", "black", "white"]);
const words = (s: string): string[] =>
  s.toLowerCase().replace(/[’']/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w));

/** A marketplace listing title is about the query product when it shares >=2 distinctive words (or all, for short queries). */
export function isRelevantListing(query: string, title: string): boolean {
  const q = new Set(words(query));
  const hits = new Set(words(title).filter((w) => q.has(w))).size;
  return q.size > 0 && hits >= Math.min(2, q.size);
}

/** Listing price in USD: AliExpress encodes the shown price in its URL ("!EUR!97.29!"), else parse the snippet. */
export function listingPriceUsd(url: string, snippet: string): number | null {
  let u = url;
  try {
    u = decodeURIComponent(url);
  } catch {
    // keep raw url
  }
  const m = /!(EUR|USD|GBP)!(\d+(?:\.\d+)?)!/.exec(u);
  return m ? toUsd(parseFloat(m[2] ?? ""), m[1] ?? null) : lowestPriceUsd(snippet);
}
