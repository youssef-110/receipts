import { ledger } from "../net/ledger";
import { politeFetch } from "../net/politeFetch";
import type { Collector, Evidence, RunCtx } from "../types";

/**
 * Earliest year whose snapshot contains the brand, assuming presence is monotonic in time
 * (once the brand appears it stays). `years` ascending; `hasBrand(year)` fetches+checks one snapshot.
 * Binary search: ~log2(n) checks. Returns null when even the latest snapshot lacks the brand.
 */
export async function firstBrandYear(
  years: number[],
  hasBrand: (year: number) => Promise<boolean>,
): Promise<number | null> {
  let lo = 0;
  let hi = years.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (await hasBrand(years[mid])) {
      found = years[mid];
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsBrand(html: string, names: string[]): boolean {
  return names.filter(Boolean).some((n) => new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(html));
}

async function cdx(url: string): Promise<string[][] | null> {
  const res = await politeFetch(url, { timeoutMs: 6000 });
  if (!res.ok) return null;
  try {
    const rows = JSON.parse(res.text) as string[][];
    return Array.isArray(rows) && rows.length > 1 ? rows.slice(1) : null; // drop header row
  } catch {
    return null;
  }
}

export const waybackCollector: Collector = {
  name: "wayback",
  modes: ["vendor", "shop"],
  timeoutMs: 15000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const { registrableDomain: d, isPlatformHost, brand, brandAliases } = ctx.site;
    if (isPlatformHost) return [];
    const out: Evidence[] = [];
    const base = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(d)}&output=json`;

    const firstUrl = `${base}&fl=timestamp,statuscode&limit=1`;
    const first = await cdx(firstUrl);
    if (!first) return out;
    const ts = first[0][0];
    const firstYear = Number(ts.slice(0, 4));
    const display = `https://web.archive.org/web/${ts}/${d}`;
    ledger.alias(display, firstUrl);
    const age = new Date().getUTCFullYear() - firstYear;
    out.push({
      id: "wayback:first-capture",
      collector: "wayback",
      claim: `The Wayback Machine first archived ${d} in ${firstYear}.`,
      url: display,
      tier: "time",
      polarity: age >= 3 ? "supports" : "neutral",
      strength: 1,
      source: "Wayback Machine",
      fetched_at: new Date().toISOString(),
      verified: true,
      data: { first_capture_year: firstYear },
    });

    const names = [brand, ...brandAliases].filter((n) => n && n.length >= 3);
    if (names.length === 0) return out;
    const perYear = await cdx(`${base}&collapse=timestamp:4&filter=statuscode:200&fl=timestamp`);
    if (!perYear) return out;
    const snaps = new Map<number, string>(perYear.map((r) => [Number(r[0].slice(0, 4)), r[0]]));
    const years = [...snaps.keys()].sort((a, b) => a - b);
    let checked = 0;
    const seenAt = new Map<number, boolean>();
    const hasBrand = async (y: number): Promise<boolean> => {
      if (checked >= 4) return seenAt.get(y) ?? true; // budget spent: stop narrowing
      checked++;
      try {
        const r = await politeFetch(`https://web.archive.org/web/${snaps.get(y)}id_/http://${d}/`, {
          timeoutMs: 6000,
          maxBytes: 1_000_000,
        });
        const ok = r.ok && containsBrand(r.text, names);
        seenAt.set(y, ok);
        return ok;
      } catch {
        seenAt.set(y, false);
        return false;
      }
    };
    const year = await firstBrandYear(years, hasBrand);
    if (year === null) return out;
    const snapUrl = `https://web.archive.org/web/${snaps.get(year)}/${d}`;
    const age2 = new Date().getUTCFullYear() - year;
    out.push({
      id: "wayback:brand-first-seen",
      collector: "wayback",
      claim: `The name "${brand}" appears on archived copies of ${d} from ${year} on.`,
      url: snapUrl,
      tier: "time",
      polarity: age2 >= 3 ? "supports" : "neutral",
      strength: 2,
      source: "Wayback Machine",
      fetched_at: new Date().toISOString(),
      verified: true,
      data: { brand_first_year: year },
    });
    return out;
  },
};
