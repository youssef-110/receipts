// Stackgini submission format lives ONLY here; adjust when their email arrives.
import type { Verdict } from "../lib/types";

export interface StackginiEntry {
  url: string;
  verdict: string;
  confidence: number;
  summary: string;
  reasons: { reason: string; source_url: string }[];
}

function labels(): Record<string, string> {
  try {
    return JSON.parse(process.env.STACKGINI_LABELS || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** source_url always comes from the Evidence objects a reason cites, never from model text. */
export function toStackgini(verdicts: Verdict[]): StackginiEntry[] {
  const map = labels();
  return verdicts.map((v) => {
    const byId = new Map(v.evidence.map((e) => [e.id, e]));
    const reasons: StackginiEntry["reasons"] = [];
    for (const r of v.reasons) {
      const ev = r.evidence_ids.map((id) => byId.get(id)).filter((e) => !!e);
      const pick = ev.find((e) => e.verified) ?? ev[0];
      if (pick) reasons.push({ reason: r.text, source_url: pick.url });
    }
    return { url: v.input, verdict: map[v.verdict] ?? v.verdict, confidence: v.confidence, summary: v.summary, reasons };
  });
}
