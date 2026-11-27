import type { Collector, Evidence, RunCtx } from "../types";

// WP2 owns this file. Stub: returns no evidence yet.
export const rdapCollector: Collector = {
  name: "rdap",
  modes: ["vendor", "shop"],
  timeoutMs: 8000,
  async run(_ctx: RunCtx): Promise<Evidence[]> {
    return [];
  },
};
