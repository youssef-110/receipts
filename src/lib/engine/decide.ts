// WP4 owns this file. LLM decide -> skeptic -> judge on Nebius Token Factory.
// WP0 stub: returns the prior band without calling a model.

import type { Conflict, Evidence, LlmCall, Reason, RunCtx, SkepticView, VerdictLabel } from "../types";
import type { Prior } from "./rubric";

export interface DecideResult {
  verdict: VerdictLabel;
  confidence: number;
  summary: string;
  reasons: Reason[];
  conflicts: Conflict[];
  check_next: string[];
  skeptic: SkepticView | null;
  llm: LlmCall[];
}

export interface DecideOpts {
  fresh?: boolean;
}

export async function decide(
  _ctx: RunCtx,
  _evidence: Evidence[],
  prior: Prior,
  conflicts: Conflict[],
  _opts: DecideOpts = {},
): Promise<DecideResult> {
  return {
    verdict: "Unsure",
    confidence: 0.2,
    summary: `Stub decision (prior band ${prior.band}).`,
    reasons: [],
    conflicts,
    check_next: ["AI decision not implemented yet"],
    skeptic: null,
    llm: [],
  };
}
