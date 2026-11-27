import { ledger } from "../net/ledger";
import { politeFetch } from "../net/politeFetch";
import { search } from "../net/tavily";
import type { Collector, Evidence, RunCtx } from "../types";
import { BENIGN_RISK, brandOf, brandRe, clip, hostOf, now, slug } from "./mentions";

// WP3b. Known breaches (HaveIBeenPwned, keyless endpoint) and risk news about the brand.

interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  PwnCount: number;
  IsVerified?: boolean;
}

const THREE_YEARS_MS = 3 * 365 * 24 * 3600 * 1000;

export async function breaches(domain: string): Promise<Evidence[]> {
  const api = `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`;
  const res = await politeFetch(api, { timeoutMs: 10000, headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const list = JSON.parse(res.text) as HibpBreach[];
  return list.slice(0, 5).map((b): Evidence => {
    const url = `https://haveibeenpwned.com/PwnedWebsites#${b.Name}`;
    ledger.alias(url, api);
    const recent = Date.now() - Date.parse(b.BreachDate) < THREE_YEARS_MS;
    return {
      id: `risk:breach-${slug(b.Name)}`,
      collector: "risk",
      claim: clip(
        `HaveIBeenPwned lists a ${b.BreachDate} breach of ${b.Domain || domain} exposing ${b.PwnCount.toLocaleString("en-US")} accounts`,
        200,
      ),
      url,
      tier: "red_flag",
      polarity: "undermines",
      strength: recent ? 3 : 2,
      source: "HaveIBeenPwned",
      fetched_at: res.fetched_at,
      verified: true,
      data: { breach_date: b.BreachDate, pwn_count: b.PwnCount, name: b.Name, is_verified: b.IsVerified ?? null },
    };
  });
}

const RISKS: { kind: string; re: RegExp; label: string }[] = [
  { kind: "breach", re: /data breach|breach(ed)?\b|hack(ed|ers?)\b|cyberattack|ransomware|data leak|datenleck|leaked/i, label: "a data breach" },
  { kind: "lawsuit", re: /lawsuit|\bsued\b|\bsues\b|class action|\bklage\b|verklagt|litigation/i, label: "a lawsuit" },
  { kind: "insolvency", re: /insolven\w*|bankrupt\w*|chapter 11|administration\b|liquidation|pleite/i, label: "insolvency" },
  { kind: "shutdown", re: /shut(ting|s)? down|shutdown|discontinu\w*|sunset(ting)?|ceases? operations/i, label: "a shutdown" },
  { kind: "fraud", re: /\bfraud\w*|\bscam\w*|betrug\w*|ponzi/i, label: "fraud or scam allegations" },
  { kind: "acquired", re: /\bacquir(ed|es|ing)\b|acquisition|übernimmt|übernommen|übernahme/i, label: "an acquisition" },
];
// The brand as victim of impersonation is not a risk of the vendor itself.
const VICTIM = /phishing|impersonat\w*|posing as|pretending to be|fake (email|website|site|job|recruiter)|scammers? (use|using)/i;
const WINDOW = 120;

export function riskNear(text: string, brand: string) {
  // Case-sensitive brand: "Linear" the company vs "linear" the adjective.
  const re = new RegExp(brandRe(brand, "").source, "gu");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    // "fraud detection" / "anti-fraud" describe a product, not an allegation.
    const w = text.slice(Math.max(0, m.index - WINDOW), m.index + brand.length + WINDOW).replace(BENIGN_RISK, " ");
    if (VICTIM.test(w)) continue;
    const r = RISKS.find((k) => k.re.test(w));
    if (r) return r;
  }
  return null;
}

async function news(brand: string, domain: string, mode: string): Promise<Evidence[]> {
  const word = mode === "shop" ? "shop" : "software";
  const res = await search(
    `"${brand}" ${word} (data breach OR lawsuit OR insolvency OR Insolvenz OR acquired OR "shutting down" OR fraud OR scam)`,
    { topic: "news", max_results: 8, exclude_domains: [domain] },
  );
  const out: Evidence[] = [];
  const kinds = new Set<string>();
  for (const r of res.results) {
    const host = hostOf(r.url);
    // News only: dated articles, not docs pages that topic=news sometimes returns.
    if (!host || host.endsWith(domain) || !r.published_date || /^(docs|help|support|developers?)\./.test(host)) continue;
    const hit = riskNear(`${r.title}. ${r.content}`, brand);
    if (!hit || kinds.has(`${hit.kind}:${host}`)) continue;
    kinds.add(`${hit.kind}:${host}`);
    const acq = hit.kind === "acquired";
    out.push({
      id: `risk:news-${slug(`${hit.kind}-${host}`)}`,
      collector: "risk",
      claim: clip(`News on ${host} links ${brand} to ${hit.label}: "${r.title}"`, 200),
      url: r.url,
      tier: acq ? "third_party" : "red_flag",
      polarity: acq ? "neutral" : "undermines",
      strength: acq ? 1 : 2,
      source: `Tavily news -> ${host}`,
      fetched_at: now(),
      verified: false,
      data: { kind: hit.kind, title: clip(r.title, 160), published_date: r.published_date ?? null },
    });
    if (out.length >= 3) break;
  }
  return out;
}

export const riskCollector: Collector = {
  name: "risk",
  modes: ["vendor", "shop"],
  timeoutMs: 20000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const domain = ctx.site.registrableDomain;
    const [b, n] = await Promise.all([
      breaches(domain).catch(() => [] as Evidence[]),
      news(brandOf(ctx.site), domain, ctx.mode).catch(() => [] as Evidence[]),
    ]);
    return [...b, ...n];
  },
};
