// WP4 owns this file. Nebius Token Factory chat client (OpenAI-compatible) over politeFetch.

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
}

export interface ChatResult {
  // Parsed JSON when json:true. Callers validate it with zod.
  json: unknown;
  raw: string;
  call: LlmCall;
}

export async function chat(_opts: ChatOpts): Promise<ChatResult> {
  throw new Error("chat() not implemented yet (WP4)");
}
