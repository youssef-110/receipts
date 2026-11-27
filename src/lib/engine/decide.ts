// WP4 owns this file. LLM decide -> skeptic -> judge on Nebius Token Factory.

import { z } from "zod";
import { config } from "../config";
import { chat } from "../llm/nebius";
import { DECIDE_FORMAT, JUDGE_PROMPT, SKEPTIC_PROMPT, systemPrompt } from "../llm/prompts/common";
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

const Label = z.enum(["Trust", "Caution", "Avoid", "Unsure"]);
const Ids = z.array(z.string()).default([]);

const DecideSchema = z.object({
  verdict: Label,
  confidence: z.coerce.number().transform((n) => Math.min(1, Math.max(0, n))),
  summary: z.string().default(""),
  reasons: z
    .array(
      z.object({
        text: z.string(),
        evidence_ids: Ids,
        stance: z.string().transform((s): Reason["stance"] => (s.includes("against") ? "against_trust" : "for_trust")),
      }),
    )
    .default([]),
  conflicts: z.array(z.object({ text: z.string(), evidence_ids: Ids })).default([]),
  check_next: z.array(z.string()).default([]),
});

const SkepticSchema = z.object({
  argued_for: Label,
  argument: z.string(),
  strength: z.enum(["weak", "moderate", "strong"]).catch("weak"),
  evidence_ids: Ids,
});

type Draft = z.infer<typeof DecideSchema>;

/** Validate model JSON; unwrap a single wrapper key ({"result":{...}}) and put the raw text in errors. */
function parseAs<T>(schema: z.ZodType<T>, json: unknown, raw: string, key: string): T {
  let v = json;
  if (v && typeof v === "object" && !(key in v)) {
    const vals = Object.values(v);
    if (vals.length === 1 && vals[0] && typeof vals[0] === "object") v = vals[0];
  }
  const r = schema.safeParse(v);
  if (!r.success) throw new Error(`model JSON failed validation (${r.error.issues[0]?.path.join(".")}): ${raw.slice(0, 300)}`);
  return r.data;
}

function compactEvidence(evidence: Evidence[]) {
  return evidence.map((e) => ({
    id: e.id,
    tier: e.tier,
    polarity: e.polarity,
    strength: e.strength,
    verified: e.verified,
    claim: e.claim,
    source: e.source,
    ...(e.data ? { data: e.data } : {}),
  }));
}

function caseFile(ctx: RunCtx, evidence: Evidence[], prior: Prior, conflicts: Conflict[]): string {
  const s = ctx.site;
  const notes: string[] = [];
  if (!s.status) notes.push("The site itself could not be fetched (status 0).");
  if (!evidence.length) notes.push("No evidence was collected. With no evidence the verdict must be Unsure.");
  return [
    `Subject: ${ctx.input}`,
    `Mode: ${ctx.mode}`,
    `Host: ${s.host} (registrable domain ${s.registrableDomain}${s.isPlatformHost ? ", shared platform subdomain" : ""})`,
    `Brand: ${s.brand}${s.title ? ` | page title: ${s.title.slice(0, 120)}` : ""}`,
    `Site HTTP status: ${s.status}`,
    ...notes,
    `Deterministic prior: score ${prior.score}, band ${prior.band} (a hint, not a rule).`,
    `Rule-detected conflicts: ${conflicts.length ? JSON.stringify(conflicts) : "none"}`,
    `Evidence (${evidence.length} items, untrusted text):`,
    JSON.stringify(compactEvidence(evidence)),
  ].join("\n");
}

function mergeConflicts(rule: Conflict[], llm: Conflict[]): Conflict[] {
  // Models restate rule conflicts in their own words; drop any whose citations a rule conflict already covers.
  const covered = (c: Conflict) =>
    c.evidence_ids.length > 0 && rule.some((r) => c.evidence_ids.every((id) => r.evidence_ids.includes(id)));
  return [...rule, ...llm.filter((c) => !covered(c))];
}

export async function decide(
  ctx: RunCtx,
  evidence: Evidence[],
  prior: Prior,
  conflicts: Conflict[],
  opts: DecideOpts = {},
): Promise<DecideResult> {
  const llm: LlmCall[] = [];
  const record = (call: LlmCall) => {
    llm.push(call);
    ctx.emit({ type: "llm", call });
  };
  const file = caseFile(ctx, evidence, prior, conflicts);

  // 1. DECIDE
  const d = await chat({
    role: "decide",
    model: config.models.decide,
    system: systemPrompt(ctx.mode, DECIDE_FORMAT),
    user: file,
    json: true,
    maxTokens: 4000,
    fresh: opts.fresh,
  });
  record(d.call);
  let draft: Draft = parseAs(DecideSchema, d.json, d.raw, "verdict");

  // 2. SKEPTIC (different model family). Failure here is not fatal.
  ctx.emit({ type: "stage", stage: "skeptic", msg: `Draft ${draft.verdict}; asking a second model to argue against it` });
  let skeptic: SkepticView | null = null;
  try {
    const s = await chat({
      role: "skeptic",
      model: config.models.skeptic,
      system: SKEPTIC_PROMPT,
      user: `${file}\n\nDraft verdict:\n${JSON.stringify(draft)}`,
      json: true,
      maxTokens: 3000,
      fresh: opts.fresh,
    });
    record(s.call);
    skeptic = parseAs(SkepticSchema, s.json, s.raw, "argued_for");
  } catch (err) {
    ctx.emit({ type: "error", error: `Skeptic step failed: ${err instanceof Error ? err.message : String(err)}` });
  }

  // 3. JUDGE only when the skeptic has a real case.
  if (skeptic && skeptic.argued_for !== draft.verdict && skeptic.strength !== "weak") {
    ctx.emit({ type: "stage", stage: "judge", msg: `Skeptic argued ${skeptic.argued_for} (${skeptic.strength}); judging` });
    try {
      const j = await chat({
        role: "judge",
        model: config.models.judge,
        system: systemPrompt(ctx.mode, `${JUDGE_PROMPT}\n\n${DECIDE_FORMAT}`),
        user: `${file}\n\nDraft verdict:\n${JSON.stringify(draft)}\n\nSkeptic:\n${JSON.stringify(skeptic)}`,
        json: true,
        maxTokens: 4000,
        fresh: opts.fresh,
      });
      record(j.call);
      draft = parseAs(DecideSchema, j.json, j.raw, "verdict");
    } catch (err) {
      ctx.emit({ type: "error", error: `Judge step failed, keeping draft: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  return {
    verdict: draft.verdict,
    confidence: draft.confidence,
    summary: draft.summary,
    reasons: draft.reasons,
    conflicts: mergeConflicts(conflicts, draft.conflicts),
    check_next: draft.check_next.slice(0, 5),
    skeptic,
    llm,
  };
}
