import { ledger } from "../net/ledger";
import { extract, search, type TavilyResult } from "../net/tavily";
import type { Collector, Evidence, RunCtx, SiteSnapshot } from "../types";

// WP3b. Third-party confirmation: pages outside the vendor's own domain that name the brand.
// Page and search text is untrusted data: we only regex-match it, never follow it.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
export const now = () => new Date().toISOString();

/** Short brand name for queries. Site titles like "HR Software for SMEs" lose to the name that matches the domain. */
export function brandOf(site: SiteSnapshot): string {
  const label = site.registrableDomain.split(".")[0] ?? site.registrableDomain;
  const cands = [site.brand, ...site.brandAliases]
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 40 && s.split(/\s+/).length <= 3);
  const nl = norm(label);
  const hit =
    cands.find((c) => norm(c) === nl) ?? cands.find((c) => norm(c).length >= 3 && (nl.includes(norm(c)) || norm(c).includes(nl)));
  return hit ?? label.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function brandRe(brand: string, flags = "i"): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(brand)}($|[^\\p{L}\\p{N}])`, `${flags}u`);
}

/** Text around the first brand mention, for the engine to read. */
export function excerpt(text: string, brand: string, width = 180): string {
  const m = brandRe(brand).exec(text);
  if (!m) return "";
  const start = Math.max(0, m.index - width / 2);
  return clip(text.slice(start, start + width), width);
}

/** Resolve within ms or give up with the fallback (keeps a slow API from killing the whole collector). */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), Math.max(0, ms)))]);
}

const DIRECTORIES =
  /(^|\.)(g2\.com|capterra\.[a-z.]+|trustradius\.com|trustpilot\.com|getapp\.[a-z.]+|softwareadvice\.[a-z.]+|crunchbase\.com|zoominfo\.com|glassdoor\.[a-z.]+|indeed\.[a-z.]+|wikipedia\.org|sourceforge\.net|saasworthy\.com|producthunt\.com|apollo\.io|rocketreach\.co|owler\.com|cbinsights\.com|pitchbook\.com|dnb\.com|northdata\.(de|com)|opencorporates\.com|kununu\.com|tavily\.com|instagram\.com|tiktok\.com|similarweb\.com|builtwith\.com|stackshare\.io|slashdot\.org|softwaresuggest\.com|omr\.com)$/;
const MEDIA =
  /(^|\.)(medium\.com|substack\.com|techcrunch\.com|forbes\.com|reuters\.com|bloomberg\.com|businessinsider\.[a-z.]+|wsj\.com|ft\.com|handelsblatt\.com|t3n\.de|gruenderszene\.de|venturebeat\.com|zdnet\.[a-z.]+|computerwoche\.de|heise\.de|theverge\.com|wired\.com|cnbc\.com|sifted\.eu|eu-startups\.com|prnewswire\.com|businesswire\.com|globenewswire\.com|reddit\.com|news\.ycombinator\.com|dev\.to|hashnode\.dev)$/;
const LISTICLE = /alternative|competitor|\bvs\.?\b|versus|comparison|\btop \d+|\bbest \d+|\breview(s)?\b|pricing/i;
const CUSTOMERISH =
  /case stud|customer|success stor|partner|\buses\b|\busing\b|chose|selected|switched|implemented|rolled out|referenz|kunde|einsetz|eingeführt/i;
const PRODUCT_WORD =
  /software|platform|\bapp\b|tool|saas|solution|system|integration|customer|partner|vendor|anbieter|lösung|plattform/i;
const FIRST_PERSON = /\b(we|our|us|wir|unser\w*)\b/i;
const USAGE = /\b(use[sd]?|using|chose|selected|switched|implemented|rolled out|introduced|partner\w*|nutzen|einsetz\w*|eingeführt)\b/i;

/** Brand appears AND the page is about the vendor (its domain, or a product word near the name). */
function confirmsBrand(text: string, brand: string, domain: string): boolean {
  if (!brandRe(brand).test(text)) return false;
  if (text.toLowerCase().includes(domain)) return true;
  const re = new RegExp(brandRe(brand).source, "giu");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (PRODUCT_WORD.test(text.slice(Math.max(0, m.index - 150), m.index + 150))) return true;
  }
  return false;
}

/** The page is a case study ABOUT the brand (brand is the host's customer): proves the brand exists, not that anyone uses it. */
function aboutBrand(title: string, url: string, brand: string): boolean {
  const nb = norm(brand);
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep empty */
  }
  if (/case-?stud|success|customer-?stor|referenz/i.test(path) && norm(path).includes(nb)) return true;
  return new RegExp(`${esc(brand)}\\s*(case study|success story|customer story)|(case study|success story)\\W+${esc(brand)}`, "i").test(title);
}

function customerStrength(text: string, brand: string, host: string, title: string, url: string): 2 | 3 {
  // Articles about the brand (brand in the title, dated news path) quote its founders: "we" is the vendor, not a customer.
  if (MEDIA.test(host) || brandRe(brand).test(title) || /\/20\d\d\/\d\d\//.test(url)) return 2;
  const re = new RegExp(brandRe(brand).source, "giu");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const w = text.slice(Math.max(0, m.index - 200), m.index + 200);
    if (FIRST_PERSON.test(w) && USAGE.test(w)) return 3;
  }
  return 2;
}

const REVIEW_DOMAINS = [
  "g2.com",
  "capterra.com",
  "trustradius.com",
  "trustpilot.com",
  "marketplace.atlassian.com",
  "appexchange.salesforce.com",
  "apps.apple.com",
  "play.google.com",
];
const REAL_REVIEWS =
  /\b\d[\d,.]*\s*(reviews?|ratings?|bewertungen)\b|\breviews?\s*[:•]?\s*(?!(?:19|20)\d\d\b)\d|\b[1-5](\.\d)?\s*(out of 5|\/\s*5|stars?)\b|trustscore\s*\d|\brated\s*[1-5]/i;
const NO_REVIEWS = /\b(no reviews|0 reviews|be the first)\b/i;

async function customerPages(brand: string, domain: string, deadline: number): Promise<Evidence[]> {
  const res = await search(`"${brand}" ${domain} customer OR "case study" OR "uses ${brand}"`, {
    exclude_domains: [domain, "linkedin.com", "facebook.com", "x.com", "twitter.com", "youtube.com"],
    max_results: 8,
  });
  const seenHosts = new Set<string>();
  const picks: TavilyResult[] = res.results
    .filter((r) => {
      const h = hostOf(r.url);
      if (!h || h === domain || h.endsWith(`.${domain}`) || DIRECTORIES.test(h)) return false;
      if (LISTICLE.test(r.title)) return false;
      return brandRe(brand).test(`${r.title} ${r.content}`);
    })
    .sort((a, b) => b.score + (CUSTOMERISH.test(`${b.title} ${b.content}`) ? 1 : 0) - (a.score + (CUSTOMERISH.test(`${a.title} ${a.content}`) ? 1 : 0)))
    .filter((r) => !seenHosts.has(hostOf(r.url)) && seenHosts.add(hostOf(r.url)))
    .slice(0, 4);
  if (!picks.length) return [];

  const extracted = await within(extract(picks.map((p) => p.url)), deadline - Date.now() - 1500, []);
  const byUrl = new Map(extracted.map((e) => [e.url, e.raw_content]));
  const out: Evidence[] = [];
  for (const p of picks) {
    const host = hostOf(p.url);
    const page = byUrl.get(p.url);
    // Extract failed or timed out: fall back to the search snippet, unverified and one notch weaker.
    const text = page ?? `${p.title} ${p.content}`;
    if (!confirmsBrand(text, brand, domain)) continue;
    const about = aboutBrand(p.title, p.url, brand);
    const s = about ? 2 : customerStrength(text, brand, host, p.title, p.url);
    const strength = (page ? s : Math.max(1, s - 1)) as 1 | 2 | 3;
    const kind = about ? "case_study_about_brand" : s === 3 ? "customer_site" : "press";
    out.push({
      id: `mentions:customer-${slug(host)}`,
      collector: "mentions",
      claim: clip(
        about
          ? `${host} publishes a case study about ${brand}: "${p.title}"`
          : s === 3
            ? `Page on ${host} describes its own use of ${brand}: "${p.title}"`
            : `Independent page on ${host} names ${brand}: "${p.title}"`,
        200,
      ),
      url: p.url,
      tier: "third_party",
      polarity: "supports",
      strength,
      source: about ? "Tavily -> partner site" : s === 3 ? "Tavily -> customer site" : "Tavily -> press/blog",
      fetched_at: now(),
      verified: !!page,
      data: { title: clip(p.title, 160), excerpt: excerpt(text, brand), kind },
    });
  }
  return out;
}

async function reviewListings(brand: string, domain: string): Promise<Evidence[]> {
  const res = await search(`"${brand}" ${domain} reviews`, { include_domains: REVIEW_DOMAINS, max_results: 5 });
  const nb = norm(brand);
  const seenHosts = new Set<string>();
  const out: Evidence[] = [];
  for (const r of res.results) {
    const host = hostOf(r.url);
    const site = host.split(".").slice(-2).join("."); // ca.trustpilot.com and trustpilot.com are one listing
    const blob = `${r.title} ${r.content}`;
    // The listing must be this vendor's: brand in the text AND (brand slug in the URL or our domain in the snippet).
    if (!brandRe(brand).test(blob)) continue;
    if (!norm(r.url).includes(nb) && !blob.toLowerCase().includes(domain)) continue;
    if (seenHosts.has(site)) continue;
    seenHosts.add(site);
    const real = REAL_REVIEWS.test(blob) && !NO_REVIEWS.test(blob);
    const cm = /\b(\d[\d,.]*)\s*(?:reviews?|ratings?|bewertungen)\b|\breviews?\s*[:•]?\s*(?!(?:19|20)\d\d\b)(\d[\d,.]*)/i.exec(blob);
    const count = cm?.[1] ?? cm?.[2] ?? null;
    out.push({
      id: `mentions:review-${slug(site)}`,
      collector: "mentions",
      claim: clip(
        real && count ? `${host} lists ${brand} with ${count} reviews (search snippet)` : `${host} has a listing page for ${brand}`,
        200,
      ),
      url: r.url,
      tier: "third_party",
      polarity: real ? "supports" : "neutral",
      strength: 1,
      source: `Tavily -> ${host}`,
      fetched_at: now(),
      verified: false,
      data: { title: clip(r.title, 160), review_count: count, real_reviews: real },
    });
    if (out.length >= 2) break;
  }
  return out;
}

export const mentionsCollector: Collector = {
  name: "mentions",
  modes: ["vendor", "shop"],
  timeoutMs: 30000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const brand = brandOf(ctx.site);
    const domain = ctx.site.registrableDomain;
    const deadline = Math.min(ctx.deadline, Date.now() + 30000);
    const [customers, reviews] = await Promise.all([
      customerPages(brand, domain, deadline).catch(() => null),
      reviewListings(brand, domain).catch(() => null),
    ]);
    // Both searches failed: say nothing rather than claim absence.
    if (!customers && !reviews) throw new Error("Tavily searches failed");
    const out = [...(customers ?? []), ...(reviews ?? [])];
    if (!out.length && customers && reviews) {
      const url = ctx.site.finalUrl;
      out.push({
        id: "mentions:none",
        collector: "mentions",
        claim: clip(`No independent page found that names ${brand} (Tavily web and review-site searches)`, 200),
        url,
        tier: "third_party",
        polarity: "neutral",
        strength: 2,
        source: "Tavily search",
        fetched_at: now(),
        verified: ledger.has(url) === "fetched",
        data: { brand, domain },
      });
    }
    return out;
  },
};
