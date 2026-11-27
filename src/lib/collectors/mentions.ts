import type { Collector, Evidence, RunCtx } from "../types";

// WP3b owns this file. Stub: returns no evidence yet.
export const mentionsCollector: Collector = {
  name: "mentions",
  modes: ["vendor", "shop"],
  timeoutMs: 30000,
  async run(_ctx: RunCtx): Promise<Evidence[]> {
    return [];
  },
};
