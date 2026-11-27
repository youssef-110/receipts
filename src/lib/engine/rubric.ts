// WP4 owns this file. Deterministic prior score + conflict rules. WP0 version: simple weighted sum.

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

export function detectConflicts(_evidence: Evidence[], _site: SiteSnapshot): Conflict[] {
  return [];
}
