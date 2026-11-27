// Shared contracts. FROZEN: change only in a tiny, separate PR agreed by the team.

export type Mode = "vendor" | "shop" | "marketplace";
export type Tier = "claimed" | "time" | "third_party" | "red_flag";
export type Polarity = "supports" | "undermines" | "neutral";
export type VerdictLabel = "Trust" | "Caution" | "Avoid" | "Unsure";

export interface Evidence {
  id: string; // `${collector}:${slug}`, stable across reruns
  collector: string;
  claim: string; // one factual sentence, <=200 chars, no opinion
  url: string; // human-openable source; must be in the run ledger
  tier: Tier;
  polarity: Polarity;
  strength: 1 | 2 | 3;
  source: string; // "Wayback Machine", "RDAP via rdap.org", "Tavily -> customer site"...
  fetched_at: string; // ISO
  verified: boolean; // true = we fetched it (or its API alias); false = URL only returned by search
  data?: Record<string, string | number | boolean | null>;
  image?: string; // shop/marketplace image used in a comparison
}

export interface SiteSnapshot {
  input: string;
  finalUrl: string;
  host: string;
  registrableDomain: string;
  isPlatformHost: boolean;
  status: number;
  html: string;
  text: string; // <=20k chars
  title?: string;
  brand: string;
  brandAliases: string[];
  links: { href: string; text: string; internal: boolean }[];
  legalPages: { kind: "imprint" | "about" | "privacy" | "terms" | "returns"; url: string; text: string }[];
  jsonLd: unknown[];
  meta: Record<string, string>;
}

export interface RunCtx {
  runId: string;
  input: string;
  mode: Mode;
  site: SiteSnapshot;
  deadline: number; // epoch ms
  emit: (e: ProgressEvent) => void;
}

export interface Collector {
  name: string;
  modes: Mode[];
  timeoutMs: number;
  run(ctx: RunCtx): Promise<Evidence[]>;
}

export interface Reason {
  text: string;
  evidence_ids: string[];
  stance: "for_trust" | "against_trust";
}

export interface Conflict {
  text: string;
  evidence_ids: string[];
}

export interface LlmCall {
  role: "extract" | "decide" | "skeptic" | "judge" | "vision";
  model: string;
  started_at: string;
  latency_ms: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  request_id?: string;
  cached: boolean;
}

export interface SkepticView {
  argued_for: VerdictLabel;
  argument: string;
  strength: "weak" | "moderate" | "strong";
  evidence_ids: string[];
}

export interface Verdict {
  input: string;
  mode: Mode;
  verdict: VerdictLabel;
  confidence: number; // 0..1
  summary: string;
  reasons: Reason[];
  conflicts: Conflict[];
  check_next: string[];
  skeptic: SkepticView | null;
  prior: { score: number; band: VerdictLabel };
  guards: string[];
  dropped_reasons: { text: string; why: string }[];
  evidence: Evidence[];
  llm: LlmCall[];
  run: { id: string; started_at: string; duration_ms: number; version: string; cache_hits: number };
}

export type ProgressEvent =
  | { type: "stage"; stage: "site" | "collect" | "decide" | "skeptic" | "judge" | "validate" | "done"; msg?: string }
  | { type: "evidence"; collector: string; items: Evidence[] }
  | { type: "collector_error"; collector: string; error: string }
  | { type: "llm"; call: LlmCall }
  | { type: "verdict"; verdict: Verdict }
  | { type: "error"; error: string };

export interface FetchOpts {
  method?: "GET" | "POST" | "HEAD";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number; // default 10000
  cacheTtlS?: number; // default: GET 86400, POST 0
  target?: boolean; // vendor/shop site: robots.txt, 1 rps, <=8 requests per run
  maxBytes?: number; // default 2MB
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  text: string;
  fromCache: boolean;
  fetched_at: string;
}
