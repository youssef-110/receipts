// End-to-end run: site -> mode -> collectors (parallel) -> prior + conflicts -> decide -> validate -> Verdict.

import { randomUUID } from "node:crypto";
import { collectorsFor } from "../collectors/index";
import { runCollector } from "../collectors/run";
import { fetchSite } from "../collectors/site";
import { config } from "../config";
import { detectMode } from "../mode";
import { withLedger } from "../net/ledger";
import type { Evidence, LlmCall, Mode, ProgressEvent, RunCtx, Verdict } from "../types";
import { decide, type DecideResult } from "./decide";
import { computePrior, detectConflicts } from "./rubric";
import { validate } from "./validate";

export interface RunOpts {
  mode?: Mode | "auto";
  fresh?: boolean;
}

function dedupeSorted(items: Evidence[]): Evidence[] {
  const byId = new Map<string, Evidence>();
  for (const e of items) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function runCheck(
  input: string,
  opts: RunOpts = {},
  report: (e: ProgressEvent) => void = () => {},
): Promise<Verdict> {
  const startedAt = Date.now();
  const runId = randomUUID().slice(0, 8);
  const secs = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  // Every LLM call (collector extract/vision, decide/skeptic/judge, failed attempts) ends up in verdict.llm.
  const calls: LlmCall[] = [];
  const emit = (e: ProgressEvent) => {
    if (e.type === "llm") calls.push(e.call);
    report(e);
  };

  return withLedger(async () => {
    emit({ type: "stage", stage: "site", msg: `Fetching ${input}` });
    const site = await fetchSite(input);
    const mode = detectMode(input, site.html, opts.mode);
    const ctx: RunCtx = { runId, input, mode, site, deadline: startedAt + config.runBudgetMs, emit };

    const collectors = collectorsFor(mode);
    emit({ type: "stage", stage: "collect", msg: `${mode} mode: ${collectors.map((c) => c.name).join(", ")}` });
    const lists = await Promise.all(collectors.map((c) => runCollector(c, ctx)));
    const evidence = dedupeSorted(lists.flat());

    const prior = computePrior(evidence);
    const ruleConflicts = detectConflicts(evidence, site);

    emit({ type: "stage", stage: "decide", msg: `${evidence.length} evidence items at ${secs()}, prior ${prior.band} (${prior.score})` });
    let draft: DecideResult;
    try {
      draft = await decide(ctx, evidence, prior, ruleConflicts, { fresh: opts.fresh });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", error: `AI decision failed: ${msg}` });
      draft = {
        verdict: "Unsure",
        confidence: 0,
        summary: "The AI decision step failed, so no verdict was made.",
        reasons: [],
        conflicts: ruleConflicts,
        check_next: ["Rerun the check: the AI decision step failed"],
        skeptic: null,
        llm: [],
      };
    }

    emit({ type: "stage", stage: "validate", msg: `AI done at ${secs()}` });
    const checked = validate(draft, evidence, prior);
    const seen = new Set<string>();
    const llm = [...calls, ...checked.draft.llm]
      .filter((c) => {
        const k = `${c.started_at}|${c.role}|${c.model}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.started_at.localeCompare(b.started_at));

    const verdict: Verdict = {
      input,
      mode,
      verdict: checked.draft.verdict,
      confidence: checked.draft.confidence,
      summary: checked.draft.summary,
      reasons: checked.draft.reasons,
      conflicts: checked.draft.conflicts,
      check_next: checked.draft.check_next,
      skeptic: checked.draft.skeptic,
      prior,
      guards: checked.guards,
      dropped_reasons: checked.dropped_reasons,
      evidence,
      llm,
      run: {
        id: runId,
        started_at: new Date(startedAt).toISOString(),
        duration_ms: Date.now() - startedAt,
        version: config.version,
        cache_hits: llm.filter((c) => c.cached).length,
      },
    };
    emit({ type: "verdict", verdict });
    emit({ type: "stage", stage: "done" });
    return verdict;
  });
}
