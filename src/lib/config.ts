// Central config: env, model ids, budgets, tier weights.

const env = (k: string, fallback = ""): string => process.env[k]?.trim() || fallback;

export const config = {
  version: "0.1.0",
  nebius: {
    baseUrl: env("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/"),
    apiKey: env("NEBIUS_API_KEY"),
  },
  tavilyKey: env("TAVILY_API_KEY"),
  watchKey: env("WATCH_KEY"),
  models: {
    // Live-tested 2026-11-27 on real personio/stackgini case files: gpt-oss decide ~2-3s; skeptic Qwen3.8-27B 1.5-3.5s
    // (GLM-5.3 was 8-65s and once returned no JSON); judge MiniMax-M3.1-Flash 2-7s (DeepSeek-V4-Pro 34-56s).
    // Kimi-K3 / GLM-5.3-Flash skeptics flipped stackgini to Caution with most judges, so they are not used.
    // Nemotron-3_5-Lightning returns no JSON as judge. Three families: OpenAI decide, Qwen skeptic, MiniMax judge.
    decide: env("MODEL_DECIDE", "openai/gpt-oss-120b"),
    decideFallback: env("MODEL_DECIDE_FALLBACK", "Qwen/Qwen3.8-27B"),
    judge: env("MODEL_JUDGE", "MiniMaxAI/MiniMax-M3.1-Flash"),
    judgeFallback: env("MODEL_JUDGE_FALLBACK", "openai/gpt-oss-120b"),
    skeptic: env("MODEL_SKEPTIC", "Qwen/Qwen3.8-27B"),
    skepticFallback: env("MODEL_SKEPTIC_FALLBACK", "openai/gpt-oss-120b"),
    extract: env("MODEL_EXTRACT", "Qwen/Qwen3-30B-A3B-Instruct-2507"),
    vision: env("MODEL_VISION", "nvidia/Nemotron-3.5-Super-VL"),
    visionFallback: env("MODEL_VISION_FALLBACK", "google/gemma-3-27b-it"),
  },
  // Per-attempt Nebius timeout by role; a timed-out primary falls back to the role's fallback model once.
  llmTimeoutMs: { decide: 20000, skeptic: 15000, judge: 20000, extract: 60000, vision: 60000 },
  // Whole-run budget; collectors each have their own timeout too, and skeptic/judge are clipped to what is left.
  runBudgetMs: Number(env("RUN_BUDGET_MS", "60000")),
  // Prior score weight per evidence tier (multiplied by strength).
  tierWeights: { claimed: 1, time: 2, third_party: 3, red_flag: 4 } as const,
  userAgent: "ReceiptsBot/0.1 (+hackathon research agent; polite, cached, low rate)",
} as const;
