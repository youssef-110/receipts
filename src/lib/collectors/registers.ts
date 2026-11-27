import type { Collector, Evidence, RunCtx } from "../types";

// WP3b owns this file. Stub: returns no evidence yet.
export const registersCollector: Collector = {
  name: "registers",
  modes: ["vendor", "shop"],
  timeoutMs: 20000,
  async run(_ctx: RunCtx): Promise<Evidence[]> {
    return [];
  },
};
