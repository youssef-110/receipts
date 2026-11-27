# Nebius Token Factory note

Challenge: Evidence to Action. Receipts turns collected evidence (often incomplete or conflicting) into a Trust / Caution / Avoid / Unsure verdict, and the verdict comes from a live Token Factory call.

## Models called on Token Factory

Model names as used in `src/lib/config.ts` (override with `MODEL_*` env vars). Endpoint: `https://api.tokenfactory.nebius.com/v1/` (OpenAI-compatible, `chat/completions`).

| Role | Model | Fallback (used on 5xx, 429 or network error) | What it does |
|---|---|---|---|
| decide | `openai/gpt-oss-120b` | `deepseek-ai/DeepSeek-V4-Pro-0813` | reads the case file and drafts the verdict, reasons and conflicts |
| skeptic | `zai-org/GLM-5.3` | `openai/gpt-oss-120b` | different model family; argues the strongest honest case for a different verdict |
| judge | `deepseek-ai/DeepSeek-V4-Pro-0813` | `openai/gpt-oss-120b` | only runs when the skeptic has a non-weak case for a different verdict; gives the final verdict |
| extract | `Qwen/Qwen3-30B-A3B-Instruct-2507` | none | marketplace mode: pulls listing fields and price context out of text |
| vision | `nvidia/Nemotron-3.5-Super-VL` | `google/gemma-3-27b-it` | shop and marketplace modes: product photo checks (AI-generated? same product as the marketplace item?) |

Why this split: in live tests on 2026-11-27, gpt-oss was fast for the main decision (about 2 s), DeepSeek-V4-Pro was slow (about 40 s on 17 evidence items) so it only judges contested cases, and DeepSeek-V4.1-Flash broke JSON mode on real case files. The skeptic is a different family on purpose so it does not share the decider's blind spots.

## Where the call decides

- `src/lib/engine/decide.ts`, function `decide()`: step 1 DECIDE, step 2 SKEPTIC, step 3 JUDGE (conditional). The label, confidence and reasons it returns are the verdict.
- `src/lib/llm/nebius.ts`, function `chat()`: the Token Factory client (JSON mode, one repair retry, fallback model, request id and token usage captured).
- `src/lib/engine/pipeline.ts` calls `decide()`; `src/lib/engine/validate.ts` then only *removes or downgrades* (drops uncited reasons, Trust guards). Nothing in code can promote a verdict or write a reason. If the call fails, the verdict is `Unsure`, not a rule-based guess.
- The deterministic prior in `src/lib/engine/rubric.ts` is passed to the model as a hint ("a hint, not a rule").

## How the demo shows the calls

The verdict page has a model-call trace panel: one row per call with role, model name, latency, tokens in / out, cached yes/no, and the Token Factory request id, plus totals. The same data is in the `llm` array of the Verdict JSON (`pnpm receipts check <url>`).

Caveat to state honestly: `chat()` caches responses (memory and disk) so reruns are reproducible; cached rows show "Cached: Yes". For a live demo use "fresh" (`--fresh` on the CLI, `"fresh": true` in the API body) to force new Token Factory calls. [CONFIRM: whether the web UI exposes a fresh toggle; the API supports it, the UI code we read only sends url and mode.]

## Two cases to demo

- **Routine: `atlassian.com`.** Long registration history, brand present in the Wayback Machine for years, customers and press on independent sites, active company. Evidence agrees, so the model drafts Trust, the skeptic argues weakly, the judge is not called, and the validator confirms at least two cited time/third-party items from two collectors.
- **Conflicting: `personio.com`.** The domain was registered in 2002, but the brand first appears in the Wayback Machine around 2017. The rule engine flags "domain registered 2002 but the brand first appears 2017: domain likely bought later". Domain age says one thing, brand age another. The skeptic argues the opposite verdict and, if its case is not weak, the judge decides. The trace panel shows decide, skeptic and judge rows, and the conflict is shown on the page instead of hidden.

[FILL IN before submitting: the actual verdicts, latencies and a screenshot of the trace panel from a fresh run of both examples.]
