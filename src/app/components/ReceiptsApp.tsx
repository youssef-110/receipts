"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Mode, ProgressEvent, Verdict } from "../../lib/types";
import { sampleVerdict } from "../fixtures/sample-verdict";
import { emptyProgress, ProgressPanel, reduceProgress, type ProgressState } from "./ProgressPanel";
import { VerdictView } from "./VerdictView";

type ModeChoice = Mode | "auto";

const MODE_OPTIONS: { value: ModeChoice; label: string }[] = [
  { value: "auto", label: "Detect automatically" },
  { value: "vendor", label: "Software vendor" },
  { value: "shop", label: "Online shop" },
  { value: "marketplace", label: "Marketplace listing" },
];

const EXAMPLES: { url: string; mode: ModeChoice; note: string }[] = [
  { url: "atlassian.com", mode: "vendor", note: "Established vendor" },
  { url: "personio.com", mode: "vendor", note: "Old domain, younger brand" },
  { url: "allbirds.com", mode: "shop", note: "Online shop" },
  { url: "https://www.amazon.com/dp/B08KTZ8249", mode: "marketplace", note: "Amazon listing" },
];

const isMode = (m: string | null): m is ModeChoice => MODE_OPTIONS.some((o) => o.value === m);

/** rate = 429 with a time; retry = network or stream failure worth retrying; input = bad URL. */
type RunError = { kind: "rate" | "retry" | "input"; msg: string; retryAt?: number };

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function ReceiptsApp() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<ModeChoice>("auto");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [sample, setSample] = useState(false);
  const [error, setError] = useState<RunError | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bootRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const [last, setLast] = useState<{ input: string; m: ModeChoice; fresh: boolean } | null>(null);

  const run = useCallback(async (target: string, m: ModeChoice, fresh = false) => {
    const input = target.trim();
    if (!input) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLast({ input, m, fresh });
    setRunning(true);
    setVerdict(null);
    setSample(false);
    setError(null);
    setWarning(null);
    setProgress(emptyProgress());
    const qs = new URLSearchParams({ url: input });
    if (m !== "auto") qs.set("mode", m);
    window.history.replaceState(null, "", `?${qs}`);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

    let gotVerdict = false;
    let lastError: string | null = null;
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fresh ? { url: input, mode: m, fresh: true } : { url: input, mode: m }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string; retryAt?: number } | null;
        if (res.status === 429) {
          const at = typeof j?.retryAt === "number" ? j.retryAt : Date.now() + Number(res.headers.get("retry-after") ?? 3600) * 1000;
          const mins = Math.max(1, Math.ceil((at - Date.now()) / 60000));
          setError({
            kind: "rate",
            retryAt: at,
            msg: `This demo allows 10 checks per hour from one connection. The next check frees up at ${clock(at)} (in about ${mins} min).`,
          });
          return;
        }
        setError({ kind: res.status === 400 ? "input" : "retry", msg: j?.error ?? `The check failed (HTTP ${res.status}).` });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const handle = (line: string) => {
        if (!line.trim()) return;
        let e: ProgressEvent;
        try {
          e = JSON.parse(line) as ProgressEvent;
        } catch {
          return;
        }
        if (e.type === "verdict") {
          gotVerdict = true;
          setVerdict(e.verdict);
        } else if (e.type === "error") {
          lastError = e.error;
        }
        setProgress((p) => reduceProgress(p ?? emptyProgress(), e));
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        lines.forEach(handle);
      }
      handle(buf + dec.decode());
      if (gotVerdict) setWarning(lastError);
      else setError({ kind: "retry", msg: lastError ?? "The connection closed before a verdict arrived." });
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      // fetch/stream failures surface as TypeError ("Failed to fetch", "network error", "terminated").
      setError({ kind: "retry", msg: err instanceof TypeError ? `The connection to the server dropped (${msg}).` : msg });
    } finally {
      if (abortRef.current === ac) setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const q = new URLSearchParams(window.location.search);
    const qUrl = q.get("url");
    const qMode = q.get("mode");
    const m = isMode(qMode) ? qMode : "auto";
    // Deferred so state updates don't run synchronously inside the effect.
    queueMicrotask(() => {
      if (q.get("demo") === "1") {
        setUrl(sampleVerdict.input);
        setVerdict(sampleVerdict);
        setSample(true);
        return;
      }
      if (qUrl) {
        setUrl(qUrl);
        setMode(m);
        void run(qUrl, m);
      }
    });
  }, [run]);

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    void run(url, mode);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <a href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <ReceiptIcon />
          Receipts
        </a>
        <a href="?demo=1" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          See a sample result
        </a>
      </header>

      <section className="pb-10 pt-8 sm:pt-14" aria-labelledby="hero-heading">
        <h1 id="hero-heading" className="max-w-[16ch] text-[2.6rem] font-bold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
          Websites are free to fake. History isn&apos;t.
        </h1>
        <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-muted">
          Paste a link to a software vendor, a shop you saw in an ad, or a marketplace listing. Receipts checks what a site
          can&apos;t fake (domain age, archive history, company registers, outside reviews) and gives a verdict where every
          reason links to its proof.
        </p>

        <form onSubmit={onSubmit} className="mt-8 rounded-xl border border-line bg-paper p-2 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="url" className="sr-only">
              Website or listing URL
            </label>
            <input
              id="url"
              name="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              required
              maxLength={2048}
              placeholder="example.com or https://shop.example/product"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-3 text-lg outline-none placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-accent"
            />
            <label htmlFor="mode" className="sr-only">
              What kind of site is it?
            </label>
            <select
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as ModeChoice)}
              className="rounded-lg border border-line bg-paper px-3 py-3 text-sm sm:w-48"
            >
              {MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={running || !url.trim()}
              className="rounded-lg bg-accent px-6 py-3 font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {running ? "Checking…" : "Check"}
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.url}
              type="button"
              disabled={running}
              onClick={() => {
                setUrl(ex.url);
                setMode(ex.mode);
                void run(ex.url, ex.mode);
              }}
              className="rounded-full border border-line bg-paper px-3 py-1 text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <span className="font-medium">{ex.url.replace(/^https:\/\/www\./, "").slice(0, 28)}</span>
              <span className="text-muted"> {ex.note}</span>
            </button>
          ))}
        </div>
      </section>

      <div ref={resultRef} className="scroll-mt-4 space-y-6 pb-16">
        {error && (
          <div
            role="alert"
            className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
              error.kind === "rate" ? "border-caution/40 bg-caution/10 text-caution" : "border-avoid/40 bg-avoid/10 text-avoid"
            }`}
          >
            <div>
              <p className="font-semibold">
                {error.kind === "rate" ? "Hourly limit reached" : error.kind === "input" ? "That address won't work" : "The check did not finish"}
              </p>
              <p className="mt-1 text-sm">{error.msg}</p>
              {error.kind === "rate" && (
                <p className="mt-1 text-sm">
                  Meanwhile, <a href="?demo=1" className="font-medium underline underline-offset-2">see a sample result</a>.
                </p>
              )}
            </div>
            {error.kind === "retry" && last && (
              <button
                type="button"
                onClick={() => void run(last.input, last.m, last.fresh)}
                className="shrink-0 rounded-lg border border-current px-4 py-2 text-sm font-semibold transition-colors hover:bg-avoid/10"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {warning && verdict && (
          <p role="status" className="rounded-lg border border-caution/40 bg-caution/10 px-4 py-2 text-sm text-caution">
            {warning}
          </p>
        )}
        {progress && (running || (!verdict && progress.stage !== null)) && <ProgressPanel p={progress} running={running} />}
        {verdict && (
          <VerdictView
            v={verdict}
            sample={sample}
            onRecheck={sample ? undefined : () => void run(verdict.input, verdict.mode, true)}
          />
        )}
      </div>

      <Footer />
    </div>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-accent" aria-hidden>
      <path
        d="M5 3h14v18l-2.33-1.5L14.33 21 12 19.5 9.67 21 7.33 19.5 5 21V3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Footer() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // Set via the DOM: React refuses javascript: URLs in href props.
    linkRef.current?.setAttribute(
      "href",
      `javascript:location.href='${window.location.origin}/?url='+encodeURIComponent(location.href)`,
    );
  }, []);
  return (
    <footer className="border-t border-line py-8 text-sm text-muted">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[62ch]">
          How it works: we read the site, then pull its history and outside records in parallel. AI models on Nebius weigh
          the evidence, a second model argues the other side, and any reason without a fetched source is removed.
        </p>
        <div className="shrink-0">
          <a
            ref={linkRef}
            href="#"
            onClick={(e) => e.preventDefault()}
            draggable
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-accent px-3 py-2 font-medium text-accent"
            aria-describedby="bm-hint"
          >
            <ReceiptIcon />
            Check this page with Receipts
          </a>
          <p id="bm-hint" className="mt-1 text-xs">
            Drag it to your bookmarks bar, then click it on any shop or vendor page.
          </p>
        </div>
      </div>
    </footer>
  );
}
