// WP4 owns this file. Citation validator + guards. WP0 version: passthrough.

import type { Evidence } from "../types";
import type { DecideResult } from "./decide";
import type { Prior } from "./rubric";

export interface ValidateResult {
  draft: DecideResult;
  guards: string[];
  dropped_reasons: { text: string; why: string }[];
}

export function validate(draft: DecideResult, _evidence: Evidence[], _prior: Prior): ValidateResult {
  return { draft, guards: [], dropped_reasons: [] };
}
