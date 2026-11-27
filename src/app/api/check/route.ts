// WP5 owns this file. WP0 version: JSON only (no streaming, no rate limit yet).

import { runCheck } from "../../../lib/engine/pipeline";
import type { Mode } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { url?: string; mode?: Mode | "auto" };
  if (!body.url) return Response.json({ error: "url is required" }, { status: 400 });
  const verdict = await runCheck(body.url, { mode: body.mode ?? "auto" });
  return Response.json(verdict);
}
