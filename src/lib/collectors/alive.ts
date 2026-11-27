import type { Collector, Evidence, RunCtx } from "../types";

// WP3a owns this file. Stub: returns no evidence yet.
export const aliveCollector: Collector = {
  name: "alive",
  modes: ["vendor"],
  timeoutMs: 12000,
  async run(_ctx: RunCtx): Promise<Evidence[]> {
    return [];
  },
};
