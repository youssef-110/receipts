// WP4 owns this file. Citation validator + deterministic guards. Runs inside withLedger.

import { ledger } from "../net/ledger";
import type { Evidence, Reason } from "../types";
import type { DecideResult } from "./decide";
import { hollowProfile, isIncident, type Prior } from "./rubric";

export interface ValidateResult {
  draft: DecideResult;
  guards: string[];
  dropped_reasons: { text: string; why: string }[];
}

/** Map a model-written id to a real one: exact, case-insensitive, or a unique match without the collector prefix. */
export function repairId(id: string, ids: string[]): string | null {
  const raw = id.trim().replace(/^["'`]+|["'`.,;]+$/g, "");
  if (ids.includes(raw)) return raw;
  const lc = raw.toLowerCase();
  const ci = ids.filter((x) => x.toLowerCase() === lc);
  if (ci.length === 1) return ci[0];
  const tail = ids.filter((x) => x.toLowerCase().endsWith(`:${lc}`));
  return tail.length === 1 ? tail[0] : null;
}

const redFlagReason = (e: Evidence): Reason => ({
  text: `Red flag: ${e.claim}`,
  evidence_ids: [e.id],
  stance: "against_trust",
});

export function validate(draft: DecideResult, evidence: Evidence[], _prior: Prior): ValidateResult {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const allIds = [...byId.keys()];
  const guards: string[] = [];
  const dropped: { text: string; why: string }[] = [];

  // Why an id may not be cited, or null when it is fine.
  const problem = (id: string): string | null => {
    const e = byId.get(id);
    if (!e) return `cites unknown evidence id "${id}"`;
    // Our own failed attempt to open the site: the link is the URL we tried, there is nothing else to fetch.
    if (e.collector === "site" && (e.id === "site:unreachable" || e.id === "site:blocked")) return null;
    if (!ledger.has(e.url)) return `cites "${id}" whose source was not fetched or seen this run`;
    return null;
  };
  const fix = (ids: string[]) => ids.map((id) => repairId(id, allIds) ?? id);
  const okIds = (ids: string[]) => fix(ids).filter((id) => !problem(id));

  const reasons: Reason[] = [];
  for (const r0 of draft.reasons) {
    const r = { ...r0, evidence_ids: [...new Set(fix(r0.evidence_ids))] };
    if (!r.evidence_ids.length) {
      dropped.push({ text: r.text, why: "cites no evidence" });
      continue;
    }
    const why = r.evidence_ids.map(problem).find((p) => p);
    if (why) {
      dropped.push({ text: r.text, why });
      continue;
    }
    if (r.stance === "for_trust") {
      // A pro-trust reason may not lean on evidence that says the opposite (stale activity, a breach write-up).
      const contra = (id: string) => byId.get(id)!.polarity === "undermines" || isIncident(byId.get(id)!);
      const kept = r.evidence_ids.filter((id) => !contra(id));
      if (!kept.length) {
        dropped.push({ text: r.text, why: "argues for trust but cites only evidence that undermines trust" });
        continue;
      }
      r.evidence_ids = kept;
    }
    reasons.push(r);
  }

  const conflicts = draft.conflicts.map((c) => ({ ...c, evidence_ids: okIds(c.evidence_ids) }));
  const skeptic = draft.skeptic ? { ...draft.skeptic, evidence_ids: okIds(draft.skeptic.evidence_ids) } : null;
  let { verdict, confidence } = draft;
  const check_next = [...draft.check_next];
  const citedAgainst = () => new Set(reasons.filter((r) => r.stance === "against_trust").flatMap((r) => r.evidence_ids));

  if (verdict === "Trust") {
    // Count only evidence the surviving for_trust reasons actually cite, so text injected into page
    // content can't talk the model into Trust without real time/third-party support behind it.
    const citedIds = new Set(reasons.filter((r) => r.stance === "for_trust").flatMap((r) => r.evidence_ids));
    const hard = evidence.filter(
      (e) => citedIds.has(e.id) && e.polarity === "supports" && (e.tier === "time" || e.tier === "third_party"),
    );
    const collectors = new Set(hard.map((e) => e.collector));
    if (hard.length < 2 || collectors.size < 2) {
      verdict = "Caution";
      guards.push(
        `Trust needs >=2 cited supporting time/third-party items from >=2 collectors (found ${hard.length} from ${collectors.size}): downgraded to Caution`,
      );
    }
  }
  if (verdict === "Trust") {
    const cited = reasons.filter((r) => r.stance === "for_trust").flatMap((r) => r.evidence_ids.map((id) => byId.get(id)!));
    if (!cited.some((e) => e.tier !== "claimed")) {
      verdict = "Caution";
      guards.push("Trust reasons cite only claimed (self-reported) evidence: downgraded to Caution");
    }
  }
  const flag = evidence.find((e) => e.tier === "red_flag" && e.polarity === "undermines" && e.strength >= 2);
  if (flag && verdict === "Trust") {
    verdict = "Caution";
    guards.push(`Red flag ${flag.id} caps the verdict at Caution`);
    if (!citedAgainst().has(flag.id) && !problem(flag.id)) reasons.push(redFlagReason(flag));
  }
  // A breach write-up must be visible to the buyer whatever the verdict ("surface it"), never silently ignored.
  for (const e of evidence.filter(isIncident).slice(0, 2)) {
    if (verdict === "Avoid" || citedAgainst().has(e.id) || problem(e.id)) continue;
    reasons.push({ text: `Security incident on record: ${e.claim}`, evidence_ids: [e.id], stance: "against_trust" });
    guards.push(`Incident ${e.id} was not discussed by the model: added as an against-trust reason`);
  }
  const hollow = hollowProfile(evidence);
  if (hollow && verdict !== "Avoid" && !hollow.some((id) => problem(id))) {
    // Looked and found nothing (not missing data): a self-made presence with no footprint is not one to hand data or money to.
    if (!reasons.some((r) => r.stance === "against_trust" && r.evidence_ids.includes(hollow[0]))) {
      reasons.push({
        text: "No independent page or company register names this vendor, and nothing shows a history older than a year.",
        evidence_ids: hollow,
        stance: "against_trust",
      });
    }
    guards.push(`Hollow profile (no third-party confirmation, no history, only self-claims): ${verdict} raised to Avoid`);
    verdict = "Avoid";
    confidence = Math.max(Math.min(confidence, 0.8), 0.6);
  }
  if (!reasons.length && verdict !== "Unsure") {
    guards.push(`No reason survived citation checks: ${verdict} changed to Unsure`);
    verdict = "Unsure";
  }
  if (!reasons.length && !check_next.length) check_next.push("Check the vendor manually: no cited evidence was available");
  if (verdict !== draft.verdict && !hollow) confidence = Math.min(confidence, verdict === "Unsure" ? 0.3 : 0.6);

  return {
    draft: { ...draft, verdict, confidence, reasons, conflicts, skeptic, check_next },
    guards,
    dropped_reasons: dropped,
  };
}
