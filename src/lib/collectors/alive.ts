// WP3a: is the vendor still active? Latest dated page on changelog/blog/status, and GitHub push activity.

import { ledger } from "../net/ledger";
import { politeFetch } from "../net/politeFetch";
import type { Collector, Evidence, RunCtx } from "../types";

const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTHS_DE: Record<string, number> = { januar: 0, februar: 1, märz: 2, mrz: 2, mai: 4, juni: 5, juli: 6, okt: 9, oktober: 9, dez: 11, dezember: 11 };

function monthIdx(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, "");
  const en = MONTHS_EN.findIndex((m) => m === w || (w.length === 3 && m.startsWith(w)) || (w === "sept" && m === "september"));
  return en >= 0 ? en : (MONTHS_DE[w] ?? -1);
}

/** Latest plausible (not future) date found in text, as epoch ms. */
export function latestDate(text: string, now = Date.now()): number | undefined {
  const found: number[] = [];
  const push = (y: number, m: number, d: number) => {
    const t = Date.UTC(y, m, d);
    if (y >= 2000 && m >= 0 && m < 12 && d >= 1 && d <= 31 && t <= now + 86_400_000) found.push(t);
  };
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) push(+m[1]!, +m[2]! - 1, +m[3]!);
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/g)) push(+m[3]!, +m[2]! - 1, +m[1]!);
  for (const m of text.matchAll(/\b([A-Za-zä]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g)) push(+m[3]!, monthIdx(m[1]!), +m[2]!);
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s+([A-Za-zä]{3,9})\.?,?\s+(20\d{2})\b/g)) push(+m[3]!, monthIdx(m[2]!), +m[1]!);
  return found.length ? Math.max(...found) : undefined;
}

const stripHtml = (h: string) =>
  h
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

function judge(t: number, now: number): { polarity: Evidence["polarity"]; strength: 1 | 2 | 3 } {
  const age = now - t;
  if (age <= 183 * 86_400_000) return { polarity: "supports", strength: 1 };
  if (age > 730 * 86_400_000) return { polarity: "undermines", strength: 1 };
  return { polarity: "neutral", strength: 1 };
}

const rank = (l: { href: string; text: string }): number => {
  const k = `${l.text} ${new URL(l.href).pathname}`.toLowerCase();
  if (/changelog|release-notes|releases|what.?s-?new|updates/.test(k)) return 0;
  if (/status/.test(k)) return 1;
  if (/blog|news|neuigkeiten/.test(k)) return 2;
  return 9;
};

export const aliveCollector: Collector = {
  name: "alive",
  modes: ["vendor"],
  timeoutMs: 12000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const s = ctx.site;
    const out: Evidence[] = [];
    const now = Date.now();

    const pages = [...new Map(s.links.filter((l) => l.internal && rank(l) < 9).map((l) => [l.href, l])).values()].sort((a, b) => rank(a) - rank(b)).slice(0, 2);
    const owner = s.links
      .map((l) => l.href.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)(?:[/?]|$)/)?.[1])
      .find((o) => o && !/^(sponsors|features|about|pricing|login|orgs|topics|marketplace|settings)$/i.test(o));

    const [pageHits, gh] = await Promise.all([
      Promise.all(
        pages.map(async (p) => {
          try {
            const r = await politeFetch(p.href, { target: true, timeoutMs: 8000 });
            if (r.status >= 400) return null;
            const t = latestDate(stripHtml(r.text), now);
            return t ? { t, url: r.finalUrl, fetched_at: r.fetched_at } : null;
          } catch {
            return null;
          }
        }),
      ),
      owner ? githubLatest(owner) : Promise.resolve(null),
    ]);

    const best = pageHits.filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => b.t - a.t)[0];
    if (best) {
      out.push({
        id: "alive:latest-update",
        collector: "alive",
        claim: `Most recent dated entry on ${new URL(best.url).pathname || "/"} is ${iso(best.t)}.`,
        url: best.url,
        tier: "time",
        source: "Site changelog/blog/status page",
        fetched_at: best.fetched_at,
        verified: true,
        ...judge(best.t, now),
        data: { latest_activity: iso(best.t) },
      });
    }
    if (gh && owner) {
      const page = `https://github.com/${owner}`;
      ledger.alias(page, gh.apiUrl);
      out.push({
        id: "alive:github",
        collector: "alive",
        claim: `GitHub ${owner}: most recently pushed repo ${gh.repo} was pushed on ${iso(gh.t)}.`,
        url: page,
        tier: "time",
        source: "GitHub API",
        fetched_at: gh.fetched_at,
        verified: true,
        ...judge(gh.t, now),
        data: { latest_activity: iso(gh.t) },
      });
    }
    return out;
  },
};

async function githubLatest(owner: string) {
  for (const kind of ["orgs", "users"]) {
    const apiUrl = `https://api.github.com/${kind}/${owner}/repos?sort=pushed&per_page=3`;
    try {
      const r = await politeFetch(apiUrl, { timeoutMs: 8000, headers: { accept: "application/vnd.github+json" } });
      if (r.status === 404) continue;
      if (r.status >= 400) return null;
      const repos = JSON.parse(r.text) as { name: string; pushed_at?: string }[];
      const top = repos.filter((x) => x.pushed_at).sort((a, b) => b.pushed_at!.localeCompare(a.pushed_at!))[0];
      return top ? { repo: top.name, t: Date.parse(top.pushed_at!), apiUrl, fetched_at: r.fetched_at } : null;
    } catch {
      return null;
    }
  }
  return null;
}
