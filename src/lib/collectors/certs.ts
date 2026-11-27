import type { Collector, Evidence, RunCtx } from "../types";

// WP2 owns this file. Stub: returns no evidence yet.
export const certsCollector: Collector = {
  name: "certs",
  modes: ["vendor", "shop"],
  timeoutMs: 12000,
  async run(_ctx: RunCtx): Promise<Evidence[]> {
    return [];
  },
};
