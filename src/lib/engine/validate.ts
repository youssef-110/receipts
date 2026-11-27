// WP4 owns this file. Citation validator + deterministic guards. Runs inside withLedger.

import { ledger } from "../net/ledger";
import type { Evidence, Reason } from "../types";
import type { DecideResult } from "./decide";
import type { Prior } from "./rubric";

export interface ValidateResult {
  draft: DecideResult;
  guards: string[];
  dropped_reasons: { text: string; why: string }[];
}

export function validate(draft: DecideResult, evidence: Evidence[], _prior: Prior): ValidateResult {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const guards: string[] = [];
  const dropped: { text: string; why: string }[] = [];

  // Why an id may not be cited, or null when it is fine.
  const problem = (id: string): string | null => {
    const e = byId.get(id);
    if (!e) return `cites unknown evidence id "${id}"`;
    if (!ledger.has(e.url)) return `cites "${id}" whose source was not fetched or seen this run`;
    return null;
  };
  const okIds = (ids: string[]) => ids.filter((id) => !problem(id));

  const reasons: Reason[] = [];
  for (const r of draft.reasons) {
    if (!r.evidence_ids.length) {
      dropped.push({ text: r.text, why: "cites no evidence" });
      continue;
    }
    const why = r.evidence_ids.map(problem).find((p) => p);
    if (why) dropped.push({ text: r.text, why });
    else reasons.push(r);
  }

  const conflicts = draft.conflicts.map((c) => ({ ...c, evidence_ids: okIds(c.evidence_ids) }));
  const skeptic = draft.skeptic ? { ...draft.skeptic, evidence_ids: okIds(draft.skeptic.evidence_ids) } : null;
  let { verdict, confidence } = draft;
  const check_next = [...draft.check_next];

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
  }
  if (!reasons.length && verdict !== "Unsure") {
    guards.push(`No reason survived citation checks: ${verdict} changed to Unsure`);
    verdict = "Unsure";
  }
  if (!reasons.length && !check_next.length) check_next.push("Check the vendor manually: no cited evidence was available");
  if (verdict !== draft.verdict) confidence = Math.min(confidence, verdict === "Unsure" ? 0.3 : 0.6);

  return {
    draft: { ...draft, verdict, confidence, reasons, conflicts, skeptic, check_next },
    guards,
    dropped_reasons: dropped,
  };
}
