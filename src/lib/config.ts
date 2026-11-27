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
    decide: env("MODEL_DECIDE", "deepseek-ai/DeepSeek-V4-Pro-0813"),
    decideFallback: env("MODEL_DECIDE_FALLBACK", "deepseek-ai/DeepSeek-V4.1-Flash-1017-fast"),
    skeptic: env("MODEL_SKEPTIC", "zai-org/GLM-5.3"),
    skepticFallback: env("MODEL_SKEPTIC_FALLBACK", "openai/gpt-oss-120b"),
    extract: env("MODEL_EXTRACT", "Qwen/Qwen3-30B-A3B-Instruct-2507"),
    vision: env("MODEL_VISION", "nvidia/Nemotron-3.5-Super-VL"),
    visionFallback: env("MODEL_VISION_FALLBACK", "google/gemma-3-27b-it"),
  },
  // Whole-run budget; collectors each have their own timeout too.
  runBudgetMs: Number(env("RUN_BUDGET_MS", "90000")),
  // Prior score weight per evidence tier (multiplied by strength).
  tierWeights: { claimed: 1, time: 2, third_party: 3, red_flag: 4 } as const,
  userAgent: "ReceiptsBot/0.1 (+hackathon research agent; polite, cached, low rate)",
} as const;
