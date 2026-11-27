// CLI: `pnpm receipts check <url> [--mode vendor|shop|marketplace] [--fresh]`
// WP6 adds: batch, score.

import { runCheck } from "../src/lib/engine/pipeline";
import type { Mode } from "../src/lib/types";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
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
  console.error("Usage: pnpm receipts check <url> [--mode vendor|shop|marketplace] [--fresh]");
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
