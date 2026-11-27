import type { Collector, Evidence, RunCtx } from "../types";

// WP2 owns this file. Stub: returns no evidence yet.
export const dnsCollector: Collector = {
  name: "dns",
  modes: ["vendor", "shop"],
  timeoutMs: 6000,
  async run(_ctx: RunCtx): Promise<Evidence[]> {
    return [];
  },
};
