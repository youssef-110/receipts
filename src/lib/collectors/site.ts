// WP3a owns this file. WP0 version: minimal fetchSite so the pipeline runs end to end.

import { parse } from "node-html-parser";
import { normalizeUrl } from "../mode";
import { isPlatformHost, registrableDomain } from "../net/domain";
import { politeFetch } from "../net/politeFetch";
import type { Collector, Evidence, RunCtx, SiteSnapshot } from "../types";

function emptySnapshot(input: string, url: string): SiteSnapshot {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return input;
    }
  })();
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
        const href = new URL(a.getAttribute("href") ?? "", res.finalUrl).toString();
        return [{ href, text: a.text.trim().slice(0, 120), internal: new URL(href).hostname.toLowerCase() === finalHost }];
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
    root.querySelectorAll("script,style,noscript,svg").forEach((n) => n.remove());
    const brand = meta["og:site_name"] || title?.split(/\s[|\-–—:]\s/)[0]?.trim() || snap.brand;
    return {
      ...snap,
      finalUrl: res.finalUrl,
      host: finalHost,
      registrableDomain: registrableDomain(finalHost),
      isPlatformHost: isPlatformHost(finalHost),
      status: res.status,
      html: res.text,
      text: root.text.replace(/\s+/g, " ").trim().slice(0, 20000),
      title,
      brand,
      brandAliases: Array.from(new Set([brand, ...snap.brandAliases])),
      links,
      jsonLd,
      meta,
    };
  } catch {
    return snap;
  }
}

export const siteClaimsCollector: Collector = {
  name: "site",
  modes: ["vendor", "shop", "marketplace"],
  timeoutMs: 15000,
  async run(_ctx: RunCtx): Promise<Evidence[]> {
    return [];
  },
};
