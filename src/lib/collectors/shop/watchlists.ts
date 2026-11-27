// WP8: fake-shop warning lists, Trustpilot/ScamAdviser snippets and Reddit complaints via one Tavily search (1 credit).

import { politeFetch } from "../../net/politeFetch";
import { search, type TavilyResult } from "../../net/tavily";
import type { Collector, Evidence, RunCtx } from "../../types";
import { ev } from "./common";

const WARN_DOMAINS = ["watchlist-internet.at", "verbraucherzentrale.de", "reddit.com"];
const REVIEW_DOMAINS = ["trustpilot.com", "scamadviser.com"];
const WARN_RE = /fake|betrug|warn|abzocke|unseri[öo]s|vorsicht|scam|gefälscht|fakeshop|dropshipping|problemati/i;
const COMPLAINT_RE = /scam|fake|never (?:arrived|received|came)|no refund|didn'?t receive|not received|betrug|abzocke|ripped off|knock[- ]?off/i;

const hostOf = (u: string): string => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Trustpilot TrustScore ("TrustScore 4.3", "4-star rating") and review count; per-review "rated 5 out of 5" is ignored. */
export function trustpilotRating(text: string): { score: number | null; reviews: number | null } {
  const sc = /trustscore\s*:?\s*(\d(?:[.,]\d)?)|(\d(?:[.,]\d)?)[- ]star rating/i.exec(text);
  const rv =
    /reviews out of (\d[\d,.]*)/i.exec(text) ?? /(\d[\d,.]*)\s*(?:reviews|bewertungen)/i.exec(text) ?? /(?:reviews|bewertungen)\s*(\d[\d,.]*)/i.exec(text);
  const score = sc ? parseFloat((sc[1] ?? sc[2] ?? "").replace(",", ".")) : null;
  const reviews = rv ? parseInt((rv[1] ?? "").replace(/[,.]/g, ""), 10) : null;
  return { score: score !== null && score >= 1 && score <= 5 ? score : null, reviews: Number.isFinite(reviews) ? reviews : null };
}

export const shopWatchlistsCollector: Collector = {
  name: "shop-watchlists",
  modes: ["shop"],
  timeoutMs: 25000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    // On platform hosts (shop.myshopify.com) the shop's own hostname is the identity, not the platform domain.
    const dom = (ctx.site.isPlatformHost ? ctx.site.host.replace(/^www\./, "") : ctx.site.registrableDomain).toLowerCase();
    if (!dom) return [];
    // Two searches (2 credits): review sites otherwise crowd warning lists out of a single top-10.
    const [warn, reviews] = await Promise.all([
      search(`"${dom}"`, { include_domains: WARN_DOMAINS, max_results: 6 }).catch(() => ({ results: [] })),
      search(`"${dom}"`, { include_domains: REVIEW_DOMAINS, max_results: 5 }).catch(() => ({ results: [] })),
    ]);
    const results = [...warn.results, ...reviews.results];
    const C = "shop-watchlists";
    const out: Evidence[] = [];
    const mentions = (r: TavilyResult) => `${r.url} ${r.title} ${r.content}`.toLowerCase().includes(dom);
    const base = (r: TavilyResult) => ({ url: r.url, verified: false, fetched_at: new Date().toISOString() });
    const done = new Set<string>();

    for (const r of results) {
      const h = hostOf(r.url);
      const blob = `${r.title} ${r.content}`;
      if (!mentions(r)) continue;
      if ((h.endsWith("watchlist-internet.at") || h.endsWith("verbraucherzentrale.de")) && WARN_RE.test(blob) && !done.has("warn")) {
        done.add("warn");
        // watchlist-internet.at keeps two lists: fraudulent shops (no delivery) and problematic shops (dropship-style issues).
        const problematic = !/betruegerisch/i.test(r.url); // problematic-shops list or news article, not the fraud list
        const page = await politeFetch(r.url, { timeoutMs: 10000 }).catch(() => null);
        const confirmed = !!page?.ok; // the search hit already names the domain; a 200 means the warning page is live
        out.push(
          ev(C, "warning-list", `${h} lists ${dom} ${problematic ? "in a problematic-shop warning" : "on its list of fraudulent shops"}: "${r.title.slice(0, 80)}".`, {
            ...base(r),
            url: confirmed ? (page?.finalUrl ?? r.url) : r.url,
            verified: confirmed,
            source: confirmed ? h : `Tavily -> ${h}`,
            tier: "red_flag",
            polarity: "undermines",
            strength: problematic ? 2 : 3,
            data: { title: r.title.slice(0, 150), list: problematic ? "problematic" : "fraud/warning" },
          }),
        );
      } else if (h.endsWith("trustpilot.com") && r.url.toLowerCase().includes(`/review/`) && !done.has("tp")) {
        const { score, reviews } = trustpilotRating(blob);
        if (score === null) continue;
        done.add("tp");
        out.push(
          ev(C, "trustpilot", `Trustpilot shows a rating of ${score}/5${reviews ? ` from ${reviews} reviews` : ""} for ${dom}.`, {
            ...base(r),
            source: "Tavily -> Trustpilot",
            tier: "third_party",
            polarity: reviews === null || reviews < 10 ? "neutral" : score >= 4 ? "supports" : score <= 2.5 ? "undermines" : "neutral",
            strength: reviews !== null && reviews >= 100 ? 2 : 1,
            data: { score, reviews },
          }),
        );
      } else if (h.endsWith("scamadviser.com") && !done.has("sa")) {
        const ts = /trust\s*score\s*(?:of|is|:)?\s*(\d{1,3})/i.exec(blob)?.[1];
        if (!ts) continue;
        done.add("sa");
        const n = Number(ts);
        out.push(
          ev(C, "scamadviser", `ScamAdviser reports a trust score of ${n}/100 for ${dom}.`, {
            ...base(r),
            source: "Tavily -> ScamAdviser",
            tier: "third_party",
            polarity: n >= 80 ? "supports" : n < 50 ? "undermines" : "neutral",
            strength: 1,
            data: { trust_score: n },
          }),
        );
      } else if (h.endsWith("reddit.com") && COMPLAINT_RE.test(blob) && r.title.toLowerCase().includes(dom.split(".")[0] ?? dom) && !done.has("rd")) {
        done.add("rd");
        out.push(
          ev(C, "reddit-complaint", `A Reddit thread about ${dom} reports problems: "${r.title.slice(0, 100)}".`, {
            ...base(r),
            source: "Tavily -> Reddit",
            tier: "red_flag",
            polarity: "undermines",
            strength: 2,
          }),
        );
      }
    }
    return out;
  },
};
