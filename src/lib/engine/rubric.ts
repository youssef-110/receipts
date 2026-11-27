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

// A page about a breach/hack of the brand is an incident, not a customer, even when a search collector labels it support.
const INCIDENT =
  /\b(data breach|breach(?:ed)?|(?<!growth |life )hack(?:ed)?|cyber ?attacks?|cyberespionage|supply[- ]chain attack|ransomware|data leak|leaked|compromised|stolen data)\b/i;

/** Third-party "support" whose own title/excerpt describes a security incident. */
export function isIncident(e: Evidence): boolean {
  if (e.tier !== "third_party" || e.polarity !== "supports") return false;
  return INCIDENT.test(`${e.claim} ${String(e.data?.title ?? "")} ${String(e.data?.excerpt ?? "")}`);
}

/**
 * Hollow vendor: we searched and found no independent page or register entry, there is no history older than a year,
 * and the site itself was reachable (so this is not missing data, it is a self-made presence with nothing behind it).
 * Returns the evidence ids that show it, or null.
 */
export function hollowProfile(evidence: Evidence[], now = new Date()): string[] | null {
  const none = evidence.find((e) => e.id === "mentions:none");
  if (!none) return null; // searches failed or found something: not "looked and found nothing"
  if (evidence.some((e) => e.id === "site:unreachable" || e.id === "site:blocked")) return null;
  // A register hit counts only if it is plausibly this vendor: imprint number matches or the entry carries the brand.
  const brand = String(none.data?.brand ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const confirms = (e: Evidence) =>
    e.collector !== "registers" ||
    e.data?.imprint_number_matches === true ||
    (brand.length >= 3 && String(e.data?.entry_name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(brand));
  if (evidence.some((e) => e.tier === "third_party" && e.polarity === "supports" && confirms(e))) return null;
  if (evidence.some((e) => e.collector === "registers" && e.polarity === "undermines")) return null; // a real (dead) company
  const year = now.getUTCFullYear();
  const old = (e: Evidence, key: string) => {
    const v = Number(e.data?.[key]);
    return Number.isFinite(v) && year - v >= 1;
  };
  const history = evidence.some((e) => {
    if (e.collector === "rdap" && typeof e.data?.registered === "string")
      return now.getTime() - Date.parse(e.data.registered) >= 365 * 86400_000;
    const proven = e.tier === "time" && e.collector !== "alive" && e.polarity === "supports";
    return proven || old(e, "brand_first_year") || old(e, "first_capture_year") || old(e, "first_cert_year");
  });
  if (history) return null;
  const platform = evidence.find((e) => e.id === "rdap:platform" || e.id === "rdap:registered");
  return [none.id, ...(platform ? [platform.id] : [])];
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

  for (const e of evidence.filter(isIncident)) {
    out.push({
      text: `${e.id} is labeled as support, but its title describes a security incident involving the brand: treat it as a red flag to surface, not as a customer.`,
      evidence_ids: [e.id],
    });
  }

  const hollow = hollowProfile(evidence, now);
  if (hollow) {
    out.push({
      text: "Searches found no independent page or company register naming this vendor, and nothing shows history older than a year: only self-claims remain (hollow profile).",
      evidence_ids: hollow,
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
