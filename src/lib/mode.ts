import type { Mode } from "./types";

const MARKETPLACE_HOSTS = [
  /(^|\.)amazon\.[a-z.]+$/,
  /(^|\.)ebay\.[a-z.]+$/,
  /(^|\.)etsy\.com$/,
  /(^|\.)aliexpress\.[a-z.]+$/,
  /(^|\.)temu\.com$/,
  /(^|\.)walmart\.com$/,
  /(^|\.)otto\.de$/,
  /(^|\.)kaufland\.de$/,
  /(^|\.)zalando\.[a-z.]+$/,
];

// Markers in a page's HTML that usually mean an online shop rather than a software vendor.
const SHOP_MARKERS = [
  /cdn\.shopify\.com|Shopify\.theme/i,
  /woocommerce/i,
  /add[\s-]?to[\s-]?cart|in den warenkorb/i,
  /"@type"\s*:\s*"Product"/i,
  /data-product-id|product-form/i,
];

export function normalizeUrl(input: string): string {
  const s = input.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Mode from the URL alone (no fetch). Returns null when the page HTML is needed to decide. */
export function modeFromUrl(input: string): Mode | null {
  let host: string;
  try {
    host = new URL(normalizeUrl(input)).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (MARKETPLACE_HOSTS.some((re) => re.test(host))) return "marketplace";
  return null;
}

/** Final mode: explicit override, else marketplace host, else shop markers in HTML, else vendor. */
export function detectMode(input: string, html = "", override?: Mode | "auto"): Mode {
  if (override && override !== "auto") return override;
  const byUrl = modeFromUrl(input);
  if (byUrl) return byUrl;
  const hits = SHOP_MARKERS.filter((re) => re.test(html)).length;
  return hits >= 2 ? "shop" : "vendor";
}
