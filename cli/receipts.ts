// CLI: `pnpm receipts check <url> [--mode vendor|shop|marketplace] [--fresh]`
//      `pnpm receipts batch <file> [--mode vendor] [--concurrency 3] [--out out/blind] [--fresh]`
//      `pnpm receipts score --verdicts <file> --script <path>`

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/lib/engine/pipeline";
import { toStackgini } from "../src/stackgini/format";
import type { Mode, Verdict } from "../src/lib/types";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const hostOf = (u: string): string => {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    return "invalid";
  }
};

function failedVerdict(input: string, mode: Mode, err: unknown): Verdict {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    input,
    mode,
    verdict: "Unsure",
    confidence: 0,
    summary: `Check failed: ${msg}`,
    reasons: [],
    conflicts: [],
    check_next: [],
    skeptic: null,
    prior: { score: 0, band: "Unsure" },
    guards: ["run_failed"],
    dropped_reasons: [],
    evidence: [],
    llm: [],
    run: { id: "failed", started_at: new Date().toISOString(), duration_ms: 0, version: "n/a", cache_hits: 0 },
  };
}

const cell = (s: string): string => s.replace(/\|/g, "\|").replace(/\s+/g, " ");

async function batch(args: string[]): Promise<void> {
  const file = args[0];
  const mode = (flag(args, "mode") as Mode | undefined) ?? "vendor";
  const conc = Math.max(1, Number(flag(args, "concurrency") ?? 3));
  const out = flag(args, "out") ?? "out/blind";
  const fresh = args.includes("--fresh");
  const urls = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  mkdirSync(out, { recursive: true });
  const results: Verdict[] = new Array(urls.length);
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  const worker = async (): Promise<void> => {
    while (next < urls.length) {
      const i = next++;
      const url = urls[i];
      const s = Date.now();
      let v: Verdict;
      try {
        v = await runCheck(url, { mode, fresh });
      } catch (err) {
        v = failedVerdict(url, mode, err);
      }
      results[i] = v;
      writeFileSync(join(out, `${i + 1}-${hostOf(url)}.json`), JSON.stringify(v, null, 2));
      console.error(`[${++done}/${urls.length}] ${url} -> ${v.verdict} (${v.confidence}) ${((Date.now() - s) / 1000).toFixed(1)}s`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, urls.length) }, worker));
  writeFileSync(join(out, "verdicts.json"), JSON.stringify(toStackgini(results), null, 2));
  const rows = results.map((v) => {
    const byId = new Map(v.evidence.map((e) => [e.id, e]));
    const top = v.reasons
      .slice(0, 3)
      .map((r) => {
        const e = r.evidence_ids.map((id) => byId.get(id)).find(Boolean);
        return e ? `${cell(r.text)} ([source](${e.url}))` : cell(r.text);
      })
      .join("<br>");
    return `| ${cell(v.input)} | ${v.verdict} | ${v.confidence} | ${top || cell(v.summary)} |`;
  });
  writeFileSync(join(out, "summary.md"), ["| url | verdict | confidence | top reasons |", "|---|---|---|---|", ...rows, ""].join("\n"));
  console.error(`done: ${urls.length} urls in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
}

function score(args: string[]): void {
  const verdicts = flag(args, "verdicts");
  const script = flag(args, "script");
  if (!verdicts || !script) throw new Error("Usage: pnpm receipts score --verdicts <file> --script <path>");
  const q = (s: string): string => `"${s.replace(/"/g, '\\"')}"`;
  const cmd = script.endsWith(".py") ? `uv run ${q(script)} ${q(verdicts)}` : `pnpm tsx ${q(script)} ${q(verdicts)}`;
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  process.exitCode = r.status ?? 1;
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "check" && args[0]) {
    const mode = (flag(args, "mode") as Mode | undefined) ?? "auto";
    const verdict = await runCheck(args[0], { mode, fresh: args.includes("--fresh") }, (e) => {
      if (e.type === "stage" || e.type === "collector_error" || e.type === "error") console.error(JSON.stringify(e));
    });
    console.log(JSON.stringify(verdict, null, 2));
    return;
  }
  if (cmd === "batch" && args[0]) return batch(args);
  if (cmd === "score") return score(args);
  console.error(
    "Usage: pnpm receipts check <url> [--mode vendor|shop|marketplace] [--fresh]\n" +
      "       pnpm receipts batch <file> [--mode vendor] [--concurrency 3] [--out out/blind] [--fresh]\n" +
      "       pnpm receipts score --verdicts <file> --script <path>",
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
