// WP3a: homepage + legal pages snapshot, and claims extracted from the vendor's own site.
// Page text is untrusted data: we only regex/parse it, never act on it.

import { parse } from "node-html-parser";
import { normalizeUrl } from "../mode";
import { isPlatformHost, registrableDomain } from "../net/domain";
import { politeFetch } from "../net/politeFetch";
import type { Collector, Evidence, RunCtx, SiteSnapshot } from "../types";

type LegalKind = SiteSnapshot["legalPages"][number]["kind"];

const LEGAL_RULES: [LegalKind, RegExp][] = [
  ["imprint", /impressum|imprint|legal[- ]notice/i],
  ["about", /about|über[- ]uns|ueber[- ]uns|company|unternehmen/i],
  ["terms", /terms|agb|nutzungsbedingungen|conditions/i],
  ["returns", /returns?|widerruf|rückgabe|rueckgabe|refund/i],
  ["privacy", /privacy|datenschutz/i],
];

function emptySnapshot(input: string, url: string): SiteSnapshot {
  let host = input;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    /* keep input */
  }
  const domain = registrableDomain(host);
  const label = domain.split(".")[0] ?? domain;
  return {
    input,
    finalUrl: url,
    host,
    registrableDomain: domain,
    isPlatformHost: isPlatformHost(host),
    status: 0,
    html: "",
    text: "",
    brand: label.charAt(0).toUpperCase() + label.slice(1),
    brandAliases: [label],
    links: [],
    legalPages: [],
    jsonLd: [],
    meta: {},
  };
}

function orgName(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map(orgName).find(Boolean);
  const o = node as Record<string, unknown>;
  const t = JSON.stringify(o["@type"] ?? "");
  if (/Organization|Corporation|LocalBusiness|Store/.test(t) && typeof o.name === "string") return o.name.trim();
  return orgName(o["@graph"]);
}

const textOf = (html: string): string => {
  const r = parse(html);
  r.querySelectorAll("script,style,noscript,svg").forEach((n) => n.remove());
  return r.text.replace(/\s+/g, " ").trim();
};

const BLOCK_TITLE = /security checkpoint|just a moment|attention required|access denied|are you a (human|robot)|verify you are human|press & hold|captcha|pardon our interruption|bot verification/i;
const BLOCK_HTML = /cf-chl|challenge-platform|_Incapsula_|datadome|px-captcha|perimeterx|vercel\.com\/security|akamai/i;

function isBotBlock(status: number, title: string | undefined, html: string, text: string): boolean {
  if (title && BLOCK_TITLE.test(title)) return true;
  if (status === 429) return true;
  if ([403, 503].includes(status) && (BLOCK_HTML.test(html) || text.length < 400)) return true;
  return html.length < 3000 && (BLOCK_HTML.test(html) || /captcha/i.test(html));
}

/** Never throws: an unreachable site returns a snapshot with status 0. */
export async function fetchSite(input: string): Promise<SiteSnapshot> {
  const url = normalizeUrl(input);
  const snap = emptySnapshot(input, url);
  try {
    const res = await politeFetch(url, { target: true, timeoutMs: 12000 });
    const root = parse(res.text);
    const meta: Record<string, string> = {};
    for (const m of root.querySelectorAll("meta")) {
      const k = m.getAttribute("property") ?? m.getAttribute("name");
      const v = m.getAttribute("content");
      if (k && v) meta[k.toLowerCase()] = v;
    }
    const title = root.querySelector("title")?.text.trim();
    const finalHost = new URL(res.finalUrl).hostname.toLowerCase();
    const links = root.querySelectorAll("a[href]").flatMap((a) => {
      try {
        const href = new URL(a.getAttribute("href") ?? "", res.finalUrl);
        if (!/^https?:$/.test(href.protocol)) return [];
        href.hash = "";
        return [{ href: href.toString(), text: a.text.replace(/\s+/g, " ").trim().slice(0, 120), internal: href.hostname.toLowerCase() === finalHost }];
      } catch {
        return [];
      }
    });
    const jsonLd = root.querySelectorAll('script[type="application/ld+json"]').flatMap((s) => {
      try {
        return [JSON.parse(s.text)];
      } catch {
        return [];
      }
    });
    const text = textOf(res.text);
    const domain = registrableDomain(finalHost);
    const label = domain.split(".")[0] ?? domain;
    if (isBotBlock(res.status, title, res.text, text)) {
      const b = label.charAt(0).toUpperCase() + label.slice(1);
      return {
        ...snap,
        finalUrl: res.finalUrl,
        host: finalHost,
        registrableDomain: domain,
        isPlatformHost: isPlatformHost(finalHost),
        status: res.status,
        brand: b,
        brandAliases: [b, label],
        meta: { "x-receipts-blocked": "bot-challenge" },
      };
    }
    const brand =
      meta["og:site_name"]?.trim() ||
      orgName(jsonLd) ||
      title?.split(/\s[|\-–—:]\s/)[0]?.trim() ||
      label.charAt(0).toUpperCase() + label.slice(1);

    // up to 3 legal pages, first matching link per kind, in priority order
    const picks: { kind: LegalKind; url: string }[] = [];
    for (const [kind, re] of LEGAL_RULES) {
      if (picks.length >= 3) break;
      const l = links.find((x) => x.internal && (re.test(x.text) || re.test(new URL(x.href).pathname)) && !picks.some((p) => p.url === x.href));
      if (l && l.href.split("?")[0] !== res.finalUrl.split("?")[0]) picks.push({ kind, url: l.href });
    }
    const legalPages = (
      await Promise.all(
        picks.map(async (p) => {
          try {
            const r = await politeFetch(p.url, { target: true, timeoutMs: 8000 });
            if (r.status >= 400) return null;
            return { kind: p.kind, url: r.finalUrl, text: textOf(r.text).slice(0, 8000) };
          } catch {
            return null;
          }
        }),
      )
    ).filter((x): x is SiteSnapshot["legalPages"][number] => x !== null);

    return {
      ...snap,
      finalUrl: res.finalUrl,
      host: finalHost,
      registrableDomain: domain,
      isPlatformHost: isPlatformHost(finalHost),
      status: res.status,
      html: res.text,
      text: text.slice(0, 20000),
      title,
      brand,
      brandAliases: Array.from(new Set([brand, label, brand.replace(/\s+/g, "")].filter(Boolean))),
      links,
      legalPages,
      jsonLd,
      meta,
    };
  } catch {
    return snap;
  }
}

// ---------- claims collector ----------

const BUILDERS: [string, RegExp][] = [
  ["Framer", /framerusercontent|framer\.com\/m\/|data-framer/i],
  ["Webflow", /webflow\.com|data-wf-site|data-wf-page/i],
  ["Wix", /wixstatic\.com|wix\.com|X-Wix/i],
  ["Lovable", /lovable\.app|lovable\.dev|gptengineer/i],
  ["Shopify", /cdn\.shopify\.com|Shopify\.theme/i],
  ["WordPress", /wp-content|wp-includes|wordpress/i],
  ["Next.js", /_next\/static|__NEXT_DATA__/i],
];

function copyrightYear(text: string): number | undefined {
  const years = [...text.matchAll(/(?:©|&copy;|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  return years.length ? Math.max(...years) : undefined;
}

function customerNames(html: string): string[] {
  const root = parse(html);
  const names = new Set<string>();
  const trigger = /trusted by|our customers|used by|loved by|kunden|vertraut von/i;
  for (const el of root.querySelectorAll("h1,h2,h3,h4,p,span,div")) {
    const own = el.text.trim();
    if (own.length > 80 || !trigger.test(own)) continue;
    let scope = el.parentNode;
    for (let i = 0; i < 3 && scope && names.size === 0; i++, scope = scope.parentNode) {
      for (const img of scope.querySelectorAll("img[alt]")) {
        const n = (img.getAttribute("alt") ?? "").replace(/\blogos?\b/gi, "").replace(/[-_]+/g, " ").trim();
        if (n.length >= 2 && n.length <= 40 && !/^(image|icon|arrow|photo|group [0-9])|rating|light|dark|mode|badge|store/i.test(n)) names.add(n);
      }
    }
    if (names.size) break;
  }
  return [...names].slice(0, 12);
}

function imprintFacts(text: string) {
  return {
    hrb: text.match(/\bHR[AB]\s?\d{3,7}(?:\s?[A-Z]{1,2}\b)?/)?.[0].replace(/\s+/g, " "),
    court: text.match(/(?:Amtsgericht|Registergericht)[:\s]+([A-ZÄÖÜ][\wäöüß-]+(?:\s[A-ZÄÖÜ][\wäöüß-]+)?)/)?.[1],
    vat: text.match(/\bDE\s?\d{9}\b/)?.[0].replace(/\s/g, ""),
    address: /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+/.test(text),
  };
}

async function checkLink(href: string): Promise<number> {
  try {
    const h = await politeFetch(href, { method: "HEAD", target: true, timeoutMs: 6000 });
    if (h.status < 400 || h.status === 404 || h.status === 410) return h.status;
  } catch {
    /* fall through to GET */
  }
  try {
    return (await politeFetch(href, { target: true, timeoutMs: 6000 })).status;
  } catch {
    return 0;
  }
}

export const siteClaimsCollector: Collector = {
  name: "site",
  modes: ["vendor", "shop"],
  timeoutMs: 15000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const s = ctx.site;
    const now = new Date().toISOString();
    const out: Evidence[] = [];
    const add = (e: Omit<Evidence, "collector" | "tier" | "source" | "fetched_at" | "verified"> & { tier?: Evidence["tier"] }) =>
      out.push({ collector: "site", tier: "claimed", source: "Site under test", fetched_at: now, verified: true, ...e });

    if (s.meta["x-receipts-blocked"]) {
      add({
        id: "site:blocked",
        claim: `${s.host} blocked automated access with a bot check (HTTP ${s.status}); site content was not read.`,
        url: s.finalUrl,
        polarity: "neutral",
        strength: 1,
        data: { status: s.status },
      });
      return out;
    }

    if (s.status === 0 || s.status >= 400) {
      add({
        id: "site:unreachable",
        claim: s.status === 0 ? `Could not reach ${s.host} (no response).` : `${s.host} answered with HTTP ${s.status}.`,
        url: s.finalUrl,
        polarity: "undermines",
        strength: 1,
        data: { status: s.status },
      });
      return out;
    }

    const year = copyrightYear(s.text);
    if (year) {
      const old = new Date().getFullYear() - year >= 3;
      add({
        id: "site:copyright",
        claim: `Copyright notice says ${year}.`,
        url: s.finalUrl,
        polarity: old ? "undermines" : "neutral",
        strength: 1,
        data: { copyright_year: year },
      });
    }

    const names = customerNames(s.html);
    if (names.length) {
      add({
        id: "site:claimed-customers",
        claim: `Site claims customers: ${names.join(", ")}.`.slice(0, 200),
        url: s.finalUrl,
        polarity: "neutral",
        strength: 1,
        data: { names: names.join(", "), count: names.length },
      });
    }

    const imp = s.legalPages.find((p) => p.kind === "imprint");
    if (imp) {
      const f = imprintFacts(imp.text);
      if (f.hrb || f.vat || f.address) {
        const bits = [f.hrb && `register ${f.hrb}`, f.court && `court ${f.court}`, f.vat && `VAT ID ${f.vat}`, f.address && !f.hrb && "postal address"].filter(Boolean);
        add({
          id: "site:imprint",
          claim: `Imprint lists ${bits.join(", ")}.`,
          url: imp.url,
          polarity: f.hrb ? "supports" : "neutral",
          strength: f.hrb ? 2 : 1,
          data: { hrb: f.hrb ?? null, court: f.court ?? null, vat: f.vat ?? null },
        });
      }
    } else if (s.host.endsWith(".de")) {
      add({
        id: "site:imprint",
        claim: `No imprint (Impressum) page found on ${s.host}, which German sites must have.`,
        url: s.finalUrl,
        polarity: "undermines",
        strength: 1,
        data: { hrb: null, court: null, vat: null },
      });
    }

    const gen = s.meta["generator"];
    const builder = BUILDERS.find(([, re]) => re.test(s.html))?.[0] ?? gen?.split(/[\s\d]/)[0];
    if (builder) {
      add({
        id: "site:generator",
        claim: `Site is built with ${builder}${gen ? ` (generator tag: ${gen.slice(0, 60)})` : ""}.`,
        url: s.finalUrl,
        polarity: "neutral",
        strength: 1,
        data: { builder },
      });
    }

    // dead help/docs links: HEAD then GET, max 2 to stay inside the 8-target-fetch budget
    const seen = new Set<string>();
    const cands = s.links
      .filter((l) => (l.internal || registrableDomain(new URL(l.href).hostname) === s.registrableDomain) && /help|docs?|documentation|support|status|hilfe/i.test(`${l.text} ${new URL(l.href).hostname}${new URL(l.href).pathname}`))
      .filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)))
      .slice(0, 2);
    if (cands.length) {
      const res = await Promise.all(cands.map(async (l) => ({ l, status: await checkLink(l.href) })));
      const dead = res.filter((r) => r.status === 404 || r.status === 410);
      if (dead.length) {
        add({
          id: "site:dead-links",
          claim: `Linked help/docs page returns ${dead[0]!.status}: ${dead.map((d) => d.l.href).join(", ")}`.slice(0, 200),
          url: dead[0]!.l.href,
          polarity: "undermines",
          strength: 2,
          data: { checked: res.length, dead: dead.length },
        });
      } else if (res.some((r) => r.status > 0 && r.status < 400)) {
        add({
          id: "site:dead-links",
          claim: `Checked ${res.length} help/docs link(s) from the homepage; none returned 404.`,
          url: s.finalUrl,
          polarity: "supports",
          strength: 1,
          data: { checked: res.length, dead: 0 },
        });
      }
    }
    return out;
  },
};
