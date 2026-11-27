// WP8: imprint / returns / contact checks from the shop's own legal pages (<=2 target fetches).

import { parse } from "node-html-parser";
import { politeFetch } from "../../net/politeFetch";
import type { Collector, Evidence, RunCtx } from "../../types";
import { ev, isShopify } from "./common";

const IMPRINT_RE = /impressum|imprint|legal[-_\s]?notice|mentions[-_\s]?l[ée]gales|aviso[-_\s]?legal|colofon/i;
const RETURNS_RE = /retour|returns?|refund|widerruf|r[üu]ckgabe|r[üu]cksendung|cancellation/i;
const CONTACT_RE = /kontakt|contact/i;
const LEGAL_FORM =
  String.raw`GmbH(?: & Co\. KG)?|UG(?: \(haftungsbeschränkt\))?|AG|KG|OHG|e\.K\.|Private Limited|Pvt\.? Ltd\.?|Ltd\.?|LTD\.?|Limited|LIMITED|LLC|Inc\.?|S\.L\.|SAS|S\.A\.|B\.V\.|SRL|S\.r\.l\.|Sp\. z o\.o\.|Co\., ?Ltd\.?|Pty Ltd|ApS|Oy`;
const COMPANY_RE = new RegExp(String.raw`((?:[A-ZÄÖÜ0-9][\w&.'’-]*\s+){1,5}(?:${LEGAL_FORM}))(?![\w])`);
const LABEL_RE = /^(?:(?:Impressum|Imprint|Legal|Notice|Firmenname|Firma|Company|Name|Betreiber|Anbieter|Inhaber|Angaben|\d+[a-z]?|DDG|TMG|MStV|RStV)\s+)+/i;

/** Company name with legal form from imprint text ("Drune Trading Private Limited", "Muster GmbH"), else null. */
export function companyName(text: string): string | null {
  const m = COMPANY_RE.exec(text)?.[1]?.replace(LABEL_RE, "").trim();
  // A bare legal form ("Private Limited") names no company.
  return m && !new RegExp(`^(?:${LEGAL_FORM})$`).test(m) && !/^(?:Private|Public)\s/.test(m) ? m : null;
}
const ADDRESS_RE = /\b\d{4,5}\s+[A-ZÄÖÜ][a-zäöüß]+|(?:stra(?:ß|ss)e|str\.|weg|platz|gasse|street|road|avenue|ave\.|rd\.)\s*\d+/i;
const ASIA_RE = /\b(China|P\.\s?R\.\s?C\.|Shenzhen|Guangzhou|Guangdong|Yiwu|Hangzhou|Dongguan|Zhejiang|Fujian|Hong\s?Kong)\b/i;
const FREE_MAILERS =
  /@(gmail\.com|googlemail\.com|outlook\.[a-z.]+|hotmail\.[a-z.]+|live\.[a-z.]+|yahoo\.[a-z.]+|gmx\.[a-z.]+|web\.de|t-online\.de|qq\.com|163\.com|126\.com|icloud\.com|aol\.com|proton(?:mail)?\.(?:com|me))\b/i;
const NON_EU_RE = /\b(Vereinigtes Königreich|United Kingdom|England|USA|Vereinigte Staaten|United States|China|Hong\s?Kong|Singapur|Singapore|Türkei|Turkey)\b/i;
const EU_TLD = /\.(de|at|fr|it|es|nl|be|pl|pt|ie|fi|se|dk|cz|sk|hu|ro|bg|gr|hr|si|lt|lv|ee|lu|eu)$/i;

type Page = { kind: "imprint" | "returns" | "contact"; url: string; text: string };

const pageText = (html: string): string => {
  const root = parse(html);
  root.querySelectorAll("script,style,noscript,svg").forEach((n) => n.remove());
  return root.text.replace(/\s+/g, " ").trim().slice(0, 20000);
};

/** EU customers are targeted: EU ccTLD, an EU html lang, or EUR prices. */
export function isEuTargeted(host: string, html: string): boolean {
  return EU_TLD.test(host) || /<html[^>]+lang=["']?(de|fr|it|es|nl|pl|pt|sv|da|fi|cs)\b/i.test(html) || /"EUR"|€/.test(html);
}

export const shopLegalCollector: Collector = {
  name: "shop-legal",
  modes: ["shop"],
  timeoutMs: 25000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const s = ctx.site;
    if (!s.html) return [];
    const C = "shop-legal";
    const pages: Page[] = s.legalPages
      .filter((p) => p.kind === "imprint" || p.kind === "returns")
      .map((p) => ({ kind: p.kind as Page["kind"], url: p.url, text: p.text }));

    // Fallback: find imprint/returns/contact links ourselves and fetch at most 2.
    const want: Page["kind"][] = (["imprint", "returns", "contact"] as const).filter((k) => !pages.some((p) => p.kind === k));
    const res: Record<Page["kind"], RegExp> = { imprint: IMPRINT_RE, returns: RETURNS_RE, contact: CONTACT_RE };
    const origin = new URL(s.finalUrl).origin;
    const toFetch: { kind: Page["kind"]; url: string }[] = [];
    for (const kind of want) {
      const l = s.links.find((x) => x.internal && (res[kind].test(x.text) || res[kind].test(new URL(x.href).pathname)));
      if (l) toFetch.push({ kind, url: l.href });
      else if (kind === "imprint" && isShopify(s.html)) toFetch.push({ kind, url: `${origin}/policies/legal-notice` });
    }
    for (const t of toFetch.slice(0, 2)) {
      const r = await politeFetch(t.url, { target: true, timeoutMs: 10000 }).catch(() => null);
      if (r?.ok) pages.push({ kind: t.kind, url: r.finalUrl, text: pageText(r.text) });
    }

    const out: Evidence[] = [];
    const eu = isEuTargeted(s.host, s.html);
    const imprint = pages.find((p) => p.kind === "imprint");
    const base = { source: "Shop website", verified: true } as const;

    if (imprint) {
      const company = companyName(imprint.text);
      const address = ADDRESS_RE.test(imprint.text);
      const abroad = eu ? NON_EU_RE.exec(imprint.text)?.[1] : undefined;
      if (company && address) {
        out.push(
          ev(C, "imprint", `The shop's imprint names the company "${company.slice(0, 80)}" with a postal address${abroad ? ` outside the EU (${abroad})` : ""}.`, {
            ...base,
            url: imprint.url,
            tier: "claimed",
            // An EU-targeted shop run from outside the EU is a real company but hard to hold to EU consumer law.
            polarity: abroad ? "neutral" : "supports",
            strength: abroad ? 1 : 2,
            data: { company, non_eu_country: abroad ?? null },
          }),
        );
      } else {
        out.push(
          ev(C, "imprint", `The shop's imprint page lists no registered company${company ? "" : " name with legal form"}${address ? "" : " or postal address"}.`, {
            ...base,
            url: imprint.url,
            tier: "claimed",
            polarity: "undermines",
            strength: 1,
            data: { company: company ?? null, address },
          }),
        );
      }
    } else if (eu && !/impressum|imprint/i.test(s.text)) {
      out.push(
        ev(C, "imprint", "The shop targets EU customers but its homepage links to no imprint (Impressum) page.", {
          ...base,
          url: s.finalUrl,
          tier: "claimed",
          polarity: "undermines",
          strength: 2,
          data: { eu_targeted: true },
        }),
      );
    }

    const all = [{ url: s.finalUrl, text: s.text }, ...pages];
    for (const p of all) {
      const m = FREE_MAILERS.exec(p.text);
      if (m) {
        out.push(
          ev(C, "free-mailer", `The shop's contact email uses the free mail provider ${m[1]}.`, {
            ...base,
            url: p.url,
            tier: "claimed",
            polarity: "undermines",
            strength: 1,
            data: { mail_domain: m[1] ?? null },
          }),
        );
        break;
      }
    }

    for (const p of pages) {
      const m = ASIA_RE.exec(p.text);
      if (!m) continue;
      const ctxText = p.text.slice(Math.max(0, m.index - 80), m.index + 80).trim();
      // Only an address-like mention counts, not "we ship to China" lists.
      if (!/\d{3,}|road|street|district|room|floor|building|adress|anschrift|address|province/i.test(ctxText)) continue;
      out.push(
        ev(C, "abroad-address", `The shop's ${p.kind} page mentions ${m[1]}${eu ? " although the shop targets EU customers" : ""}.`, {
          ...base,
          url: p.url,
          tier: "red_flag",
          polarity: "undermines",
          strength: 2,
          data: { place: m[1] ?? null, excerpt: ctxText.slice(0, 160), eu_targeted: eu },
        }),
      );
      break;
    }
    return out;
  },
};
