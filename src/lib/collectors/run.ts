import type { Collector, Evidence, RunCtx } from "../types";

/**
 * Runs one collector with its own timeout.
 * The broad catch is deliberate (accepted Norma finding): one dead source (crt.sh timing out,
 * Wayback returning 429) must degrade to a visible `collector_error` event, never kill the verdict.
 */
export async function runCollector(c: Collector, ctx: RunCtx): Promise<Evidence[]> {
  const budget = Math.max(1000, Math.min(c.timeoutMs, ctx.deadline - Date.now()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${budget} ms`)), budget);
  });
  try {
    const items = await Promise.race([c.run(ctx), timeout]);
    if (items.length) ctx.emit({ type: "evidence", collector: c.name, items });
    return items;
  } catch (err) {
    ctx.emit({ type: "collector_error", collector: c.name, error: err instanceof Error ? err.message : String(err) });
    return [];
  } finally {
    clearTimeout(timer);
  }
}
