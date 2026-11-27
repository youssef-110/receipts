// Calibration scorer: `pnpm tsx data/calibration/score.ts <outDir> [vendors.txt]`
// Reads "# expected: Label [Alt] — why" lines above each URL and compares with <outDir>/<n>-<host>.json verdicts.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface V {
  input: string;
  verdict: string;
  confidence: number;
  guards: string[];
  dropped_reasons: { text: string; why: string }[];
  reasons: { evidence_ids: string[]; stance: string }[];
  evidence: { id: string; tier: string; polarity: string; strength: number }[];
}

const [outDir, listFile = "data/calibration/vendors.txt"] = process.argv.slice(2);
if (!outDir) throw new Error("usage: score.ts <outDir> [vendors.txt]");

const expected: { url: string; label: string; alts: string[] }[] = [];
let pending: { label: string; alts: string[] } | null = null;
for (const line of readFileSync(listFile, "utf8").split(/\r?\n/).map((l) => l.trim())) {
  const m = /^#\s*expected:\s*(\w+)\s*(?:\[([^\]]+)\])?/.exec(line);
  if (m) pending = { label: m[1], alts: m[2] ? m[2].split(/[,|\s]+/).filter(Boolean) : [] };
  else if (line && !line.startsWith("#")) {
    expected.push({ url: line, ...(pending ?? { label: "?", alts: [] }) });
    pending = null;
  }
}

const files = readdirSync(outDir).filter((f) => /^\d+-.*\.json$/.test(f));
const byIndex = new Map(files.map((f) => [Number(f.split("-")[0]), f]));
let strict = 0;
let lenient = 0;
const rows: string[] = [];
expected.forEach((x, i) => {
  const f = byIndex.get(i + 1);
  const v: V | null = f ? (JSON.parse(readFileSync(join(outDir, f), "utf8")) as V) : null;
  const got = v?.verdict ?? "missing";
  const s = got === x.label;
  const l = s || x.alts.includes(got);
  strict += +s;
  lenient += +l;
  const flags = v?.evidence.filter((e) => e.tier === "red_flag" && e.polarity === "undermines").map((e) => e.id) ?? [];
  const cited = new Set(v?.reasons.flatMap((r) => r.evidence_ids) ?? []);
  rows.push(
    [
      s ? "OK " : l ? "ok~" : "XX ",
      x.url.padEnd(36),
      `exp ${x.label}${x.alts.length ? `[${x.alts.join("|")}]` : ""}`.padEnd(22),
      `got ${got} (${v?.confidence ?? "-"})`.padEnd(22),
      `flags ${flags.length} cited ${flags.filter((id) => cited.has(id)).length}`,
      `dropped ${v?.dropped_reasons.length ?? 0}`,
      v?.guards.length ? `guards: ${v.guards.join(" / ")}` : "",
    ].join("  "),
  );
});
console.log(rows.join("\n"));
console.log(`\nstrict ${strict}/${expected.length}  lenient ${lenient}/${expected.length}`);
