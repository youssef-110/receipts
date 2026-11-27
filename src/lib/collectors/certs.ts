import { ledger } from "../net/ledger";
import { politeFetch } from "../net/politeFetch";
import type { Collector, Evidence, RunCtx } from "../types";

interface CrtRow {
  not_before?: string;
  name_value?: string;
}

export const certsCollector: Collector = {
  name: "certs",
  modes: ["vendor", "shop"],
  timeoutMs: 12000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const { registrableDomain: d, isPlatformHost } = ctx.site;
    if (isPlatformHost) return [];
    const api = `https://crt.sh/?q=${encodeURIComponent(d)}&output=json`;
    const res = await politeFetch(api, { timeoutMs: 11000, maxBytes: 20_000_000 });
    if (!res.ok) return [];
    let rows: CrtRow[];
    try {
      rows = JSON.parse(res.text) as CrtRow[];
    } catch {
      return [];
    }
    if (!Array.isArray(rows) || rows.length === 0) return [];
    let first = Infinity;
    const names = new Set<string>();
    for (const r of rows) {
      const t = r.not_before ? Date.parse(r.not_before.endsWith("Z") ? r.not_before : `${r.not_before}Z`) : NaN;
      if (!Number.isNaN(t) && t < first) first = t;
      for (const n of (r.name_value ?? "").split("\n")) {
        const h = n.trim().toLowerCase().replace(/^\*\./, "");
        if (h) names.add(h);
      }
    }
    if (!Number.isFinite(first)) return [];
    const firstDate = new Date(first);
    const years = (Date.now() - first) / (365.25 * 86400_000);
    const subs = names.size;
    const display = `https://crt.sh/?q=${encodeURIComponent(d)}`;
    ledger.alias(display, api);
    return [
      {
        id: "certs:first-cert",
        collector: "certs",
        claim: `The first public TLS certificate for ${d} was issued on ${firstDate.toISOString().slice(0, 10)}; ${subs} distinct hostnames appear in certificate logs.`,
        url: display,
        tier: "time",
        polarity: years >= 3 && subs >= 5 ? "supports" : "neutral",
        strength: 1,
        source: "crt.sh (Certificate Transparency)",
        fetched_at: res.fetched_at,
        verified: true,
        data: { first_cert_year: firstDate.getUTCFullYear(), subdomain_count: subs },
      },
    ];
  },
};
