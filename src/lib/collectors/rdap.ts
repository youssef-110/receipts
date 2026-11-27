import { politeFetch } from "../net/politeFetch";
import type { Collector, Evidence, RunCtx } from "../types";

interface RdapDoc {
  events?: { eventAction?: string; eventDate?: string }[];
}

export const rdapCollector: Collector = {
  name: "rdap",
  modes: ["vendor", "shop"],
  timeoutMs: 8000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const { registrableDomain: d, isPlatformHost } = ctx.site;
    if (isPlatformHost) {
      return [
        {
          id: "rdap:platform",
          collector: "rdap",
          claim: "Shared platform subdomain: registration date says nothing about this site",
          url: ctx.site.finalUrl,
          tier: "time",
          polarity: "neutral",
          strength: 1,
          source: "Receipts domain check",
          fetched_at: new Date().toISOString(),
          verified: true,
          data: { platform_host: ctx.site.host },
        },
      ];
    }
    const res = await politeFetch(`https://rdap.org/domain/${d}`, { timeoutMs: 7500 });
    if (!res.ok) return []; // e.g. .de: no public RDAP
    let doc: RdapDoc;
    try {
      doc = JSON.parse(res.text) as RdapDoc;
    } catch {
      return [];
    }
    const reg = doc.events?.find((e) => e.eventAction === "registration")?.eventDate;
    const date = reg ? new Date(reg) : null;
    if (!date || Number.isNaN(date.getTime())) return [];
    const years = (Date.now() - date.getTime()) / (365.25 * 86400_000);
    const polarity = years >= 3 ? "supports" : years >= 1 ? "neutral" : "undermines";
    return [
      {
        id: "rdap:registered",
        collector: "rdap",
        claim: `${d} was registered on ${date.toISOString().slice(0, 10)} (${years.toFixed(1)} years ago).`,
        url: res.finalUrl,
        tier: "time",
        polarity,
        strength: polarity === "undermines" ? 2 : 1,
        source: "RDAP via rdap.org",
        fetched_at: res.fetched_at,
        verified: true,
        data: { registered_year: date.getUTCFullYear(), registered: date.toISOString() },
      },
    ];
  },
};
