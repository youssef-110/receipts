// WP4 owns this file. Deterministic prior score + conflict rules.

import { config } from "../config";
import type { Conflict, Evidence, SiteSnapshot, VerdictLabel } from "../types";

export interface Prior {
  score: number;
  band: VerdictLabel;
}

export function computePrior(evidence: Evidence[]): Prior {
  let score = 0;
  for (const e of evidence) {
    const w = config.tierWeights[e.tier] * e.strength;
    if (e.polarity === "supports") score += w;
    if (e.polarity === "undermines") score -= w;
  }
  const band: VerdictLabel = evidence.length < 3 ? "Unsure" : score >= 10 ? "Trust" : score <= -4 ? "Avoid" : "Caution";
  return { score, band };
}

/** First evidence item from `collector` (optionally with exact `id`) carrying a finite numeric data[key]. */
function num(evidence: Evidence[], collector: string, key: string, id?: string): { e: Evidence; v: number } | null {
  for (const e of evidence) {
    if (e.collector !== collector || (id && e.id !== id)) continue;
    const raw = e.data?.[key];
    const v = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(v)) return { e, v };
  }
  return null;
}

export function detectConflicts(evidence: Evidence[], site: SiteSnapshot, now = new Date()): Conflict[] {
  const out: Conflict[] = [];
  const year = now.getUTCFullYear();
  const reg = num(evidence, "rdap", "registered_year");
  const brand =
    num(evidence, "wayback", "brand_first_year", "wayback:brand-first-seen") ?? num(evidence, "wayback", "brand_first_year");
  const firstCap = num(evidence, "wayback", "first_capture_year");

  if (reg && brand && brand.v - reg.v > 2) {
    out.push({
      text: `Domain registered in ${reg.v} but the brand first appears in ${brand.v}: domain likely bought later; brand history starts ${brand.v}.`,
      evidence_ids: [reg.e.id, brand.e.id],
    });
  }
  if (reg && firstCap && firstCap.v < reg.v) {
    out.push({
      text: `Wayback has captures from ${firstCap.v}, before the current registration in ${reg.v}: the domain was re-registered.`,
      evidence_ids: [firstCap.e.id, reg.e.id],
    });
  }

  const copyright = num(evidence, "site", "copyright_year", "site:copyright");
  const alive = evidence.find((e) => e.collector === "alive" && typeof e.data?.latest_activity === "string");
  const latest = alive ? Date.parse(String(alive.data?.latest_activity)) : NaN;
  if (copyright && year - copyright.v >= 3 && Number.isFinite(latest) && now.getTime() - latest < 183 * 86400_000) {
    out.push({
      text: `Site footer says ${copyright.v}, but product activity is recent (${String(alive?.data?.latest_activity).slice(0, 10)}): dated site, live product.`,
      evidence_ids: [copyright.e.id, alive!.id],
    });
  }

  const claimed = evidence.filter((e) => e.collector === "site" && e.data?.names != null && String(e.data.names).trim());
  const confirmed = evidence.some((e) => e.collector === "mentions" && e.tier === "third_party" && e.polarity === "supports");
  if (claimed.length && !confirmed) {
    out.push({
      text: "The site names customers, but no independent source found this run confirms them: claimed customers unconfirmed.",
      evidence_ids: claimed.map((e) => e.id),
    });
  }

  if (site.isPlatformHost) {
    out.push({
      text: `${site.host} is a subdomain on a shared platform: domain age says nothing about this seller.`,
      evidence_ids: reg ? [reg.e.id] : [],
    });
  }
  return out;
}
