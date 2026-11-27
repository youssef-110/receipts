import type { Collector, Evidence, RunCtx } from "../types";

// WP2 owns this file. Stub: returns no evidence yet.
export const waybackCollector: Collector = {
  name: "wayback",
  modes: ["vendor", "shop"],
  timeoutMs: 15000,
  async run(_ctx: RunCtx): Promise<Evidence[]> {
    return [];
  },
};
