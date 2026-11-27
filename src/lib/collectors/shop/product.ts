// WP8: identify the product (JSON-LD / og / Shopify JSON) and report its listing age and price.

import type { Collector, Evidence, RunCtx } from "../../types";
import { ev, getProduct } from "./common";

const DAY = 86_400_000;

/** Year the shop claims to have started ("since 2009", "seit 1998", "over 15 years"), else null. */
export function claimedStartYear(text: string, now = new Date()): number | null {
  const y = /\b(?:since|seit|est\.?|established|founded|gegründet)\s*(?:in\s*)?((?:19|20)\d\d)\b/i.exec(text)?.[1];
  if (y) return Number(y);
  const n = /\b(?:over|more than|über|mehr als)?\s*(\d{1,3})\+?\s*(?:years|jahre[n]?)\s*(?:of\s*)?(?:experience|erfahrung|in business|tradition|am markt)/i.exec(text)?.[1];
  return n && Number(n) >= 2 ? now.getFullYear() - Number(n) : null;
}

export const shopProductCollector: Collector = {
  name: "shop-product",
  modes: ["shop"],
  timeoutMs: 15000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const p = await getProduct(ctx);
    if (!p) return [];
    const C = "shop-product";
    const out: Evidence[] = [];
    const common = { url: p.url, source: p.source, verified: true } as const;
    out.push(
      ev(C, "price", `Product "${p.title.slice(0, 80)}" is listed at ${p.price ?? "an unlisted price"}${p.currency ? ` ${p.currency}` : ""}.`, {
        ...common,
        tier: "claimed",
        polarity: "neutral",
        strength: 1,
        data: { title: p.title, price: p.price, currency: p.currency, image: p.images[0] ?? null },
        image: p.images[0],
      }),
    );

    const claimYear = claimedStartYear(ctx.site.text);
    const ageDays = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : null);
    const age = ageDays(p.createdAt);
    const oldest = ageDays(p.catalogOldest);
    const claimsYears = claimYear !== null && new Date().getFullYear() - claimYear >= 2;
    // A whole sampled catalog created recently says more than one new product.
    if (p.catalogCount >= 3 && oldest !== null && oldest < 60) {
      out.push(
        ev(C, "catalog-age", `All ${p.catalogCount} sampled products in the shop's catalog were created within the last ${Math.max(1, oldest)} day(s)${claimsYears ? `, while the shop claims to operate since ${claimYear}` : ""}.`, {
          ...common,
          tier: "time",
          polarity: "undermines",
          strength: claimsYears ? 2 : 1,
          data: { oldest_created_at: p.catalogOldest, newest_created_at: p.catalogNewest, claimed_since: claimYear },
        }),
      );
    } else if (age !== null) {
      const recent = age < 60;
      out.push(
        ev(C, "age", `Product "${p.title.slice(0, 60)}" was created in the shop on ${p.createdAt?.slice(0, 10)} (${age} days ago)${recent && claimsYears ? `, while the shop claims to operate since ${claimYear}` : ""}.`, {
          ...common,
          tier: "time",
          polarity: recent ? (claimsYears ? "undermines" : "neutral") : age > 365 ? "supports" : "neutral",
          strength: recent && claimsYears ? 2 : 1,
          data: { created_at: p.createdAt, age_days: age, claimed_since: claimYear },
        }),
      );
    }
    return out;
  },
};
