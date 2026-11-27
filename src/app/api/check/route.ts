// WP5: POST /api/check. Streams NDJSON ProgressEvents by default; returns Verdict JSON when Accept: application/json.

import { runCheck } from "../../../lib/engine/pipeline";
import type { Mode, ProgressEvent } from "../../../lib/types";
import { validInput } from "./validInput";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODES = new Set(["auto", "vendor", "shop", "marketplace"]);
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
// shortcut: in-memory per-process limiter, resets on restart and is not shared across instances; move to KV if deployed at scale.
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { url?: unknown; mode?: unknown; fresh?: unknown };
  const input = validInput(body.url);
  if (!input) {
    return Response.json(
      { error: "Enter a web address like example.com or https://example.com/page (http or https, up to 2048 characters)." },
      { status: 400 },
    );
  }
  const mode = (typeof body.mode === "string" && MODES.has(body.mode) ? body.mode : "auto") as Mode | "auto";
  const fresh = body.fresh === true;

  const watchKey = process.env.WATCH_KEY;
  const trusted = Boolean(watchKey) && req.headers.get("x-receipts-key") === watchKey;
  if (!trusted) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (rateLimited(ip)) {
      return Response.json({ error: "Limit reached: 10 checks per hour. Try again later." }, { status: 429 });
    }
  }

  if (req.headers.get("accept")?.includes("application/json")) {
    try {
      return Response.json(await runCheck(input, { mode, fresh }));
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (e: ProgressEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          closed = true; // client went away
        }
      };
      runCheck(input, { mode, fresh }, send)
        .catch((err: unknown) => send({ type: "error", error: err instanceof Error ? err.message : String(err) }))
        .finally(() => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
