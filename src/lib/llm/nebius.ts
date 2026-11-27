// WP4 owns this file. Nebius Token Factory chat client (OpenAI-compatible) over politeFetch.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { politeFetch, PoliteFetchError } from "../net/politeFetch";
import type { LlmCall } from "../types";

export interface ChatOpts {
  role: LlmCall["role"];
  model: string;
  system: string;
  user: string;
  json?: boolean;
  images?: string[]; // image URLs or data: URIs (vision models only)
  maxTokens?: number;
  fresh?: boolean; // skip the LLM response cache
  timeoutMs?: number; // per attempt; default config.llmTimeoutMs[role]
}

/** Thrown by chat() when every attempt failed; `call` is the failed attempt's trace record. */
export class ChatError extends Error {
  constructor(
    message: string,
    readonly call: LlmCall,
  ) {
    super(message);
  }
}

export interface ChatResult {
  // Parsed JSON when json:true. Callers validate it with zod.
  json: unknown;
  raw: string;
  call: LlmCall;
}

type Message = { role: "system" | "user" | "assistant"; content: unknown };

interface Completion {
  id?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const CACHE_DIR = path.join(process.cwd(), ".cache", "llm");
const memCache = new Map<string, { raw: string; id?: string; usage?: Completion["usage"] }>();

const FALLBACK: Record<string, string> = {
  [config.models.decide]: config.models.decideFallback,
  [config.models.judge]: config.models.judgeFallback,
  [config.models.skeptic]: config.models.skepticFallback,
  [config.models.vision]: config.models.visionFallback,
};

class RetryableError extends Error {}

/** Strip <think> blocks and ``` fences, then take the outermost {...}. Throws when nothing parses. */
export function parseJsonLoose(raw: string): unknown {
  const s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(s.slice(start, end + 1));
}

function cacheKey(model: string, messages: Message[], json: boolean): string {
  return createHash("sha256").update(JSON.stringify({ model, messages, json })).digest("hex");
}

async function cacheGet(key: string) {
  const hit = memCache.get(key);
  if (hit || process.env.VERCEL) return hit;
  try {
    const disk = JSON.parse(await readFile(path.join(CACHE_DIR, `${key}.json`), "utf8"));
    memCache.set(key, disk);
    return disk as { raw: string; id?: string; usage?: Completion["usage"] };
  } catch {
    return undefined;
  }
}

async function cachePut(key: string, value: { raw: string; id?: string; usage?: Completion["usage"] }) {
  memCache.set(key, value);
  if (process.env.VERCEL) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value));
  } catch {
    // cache is best effort
  }
}

async function post(model: string, messages: Message[], json: boolean, maxTokens: number, timeoutMs: number): Promise<Completion> {
  let res;
  try {
    res = await politeFetch(`${config.nebius.baseUrl}chat/completions`, {
      method: "POST",
      cacheTtlS: 0,
      timeoutMs,
      maxBytes: 4_000_000,
      headers: { authorization: `Bearer ${config.nebius.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        seed: 7,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (err) {
    if (err instanceof PoliteFetchError) throw new RetryableError(err.message);
    throw err;
  }
  if (res.status >= 500 || res.status === 429) throw new RetryableError(`Nebius ${res.status} for ${model}`);
  if (!res.ok) throw new Error(`Nebius ${res.status} for ${model}: ${res.text.slice(0, 200)}`);
  return JSON.parse(res.text) as Completion;
}

export async function chat(opts: ChatOpts): Promise<ChatResult> {
  if (!config.nebius.apiKey) throw new Error("NEBIUS_API_KEY is not set");
  const json = opts.json ?? false;
  const maxTokens = opts.maxTokens ?? 1800;
  const userContent = opts.images?.length
    ? [{ type: "text", text: opts.user }, ...opts.images.map((url) => ({ type: "image_url", image_url: { url } }))]
    : opts.user;
  const messages: Message[] = [
    { role: "system", content: opts.system },
    { role: "user", content: userContent },
  ];

  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? config.llmTimeoutMs[opts.role];
  let model = opts.model;
  const key = cacheKey(model, messages, json);
  let cached = false;
  let usage: Completion["usage"];
  let id: string | undefined;
  let raw = "";
  const record = (): LlmCall => ({
    role: opts.role,
    model,
    started_at: new Date(started).toISOString(),
    latency_ms: Date.now() - started,
    prompt_tokens: usage?.prompt_tokens,
    completion_tokens: usage?.completion_tokens,
    request_id: id,
    cached,
  });

  let parsed: unknown = null;
  try {
    const hit = opts.fresh ? undefined : await cacheGet(key);
    if (hit) {
      ({ raw, id, usage } = hit);
      cached = true;
    } else {
      let completion: Completion;
      try {
        completion = await post(model, messages, json, maxTokens, timeoutMs);
      } catch (err) {
        // A timeout surfaces as RetryableError, so a slow model falls back instead of hanging the run.
        const fb = FALLBACK[model];
        if (!(err instanceof RetryableError) || !fb) throw err;
        model = fb;
        completion = await post(model, messages, json, maxTokens, timeoutMs);
      }
      raw = completion.choices?.[0]?.message?.content ?? "";
      id = completion.id;
      usage = completion.usage;
    }

    if (json) {
      try {
        parsed = parseJsonLoose(raw);
      } catch {
        // One repair attempt: show the model its own output and ask for clean JSON.
        const repair = await post(
          model,
          [
            ...messages,
            { role: "assistant", content: raw.slice(0, 6000) },
            { role: "user", content: "That was not valid JSON. Reply again with ONLY the single JSON object, no prose." },
          ],
          true,
          maxTokens,
          timeoutMs,
        );
        raw = repair.choices?.[0]?.message?.content ?? "";
        parsed = parseJsonLoose(raw); // throws if still broken
        cached = false;
      }
    }
  } catch (err) {
    throw new ChatError(err instanceof Error ? err.message : String(err), record());
  }
  if (!cached) await cachePut(key, { raw, id, usage });
  return { json: parsed, raw, call: record() };
}
