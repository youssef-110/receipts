"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Mode, ProgressEvent, Verdict } from "../../lib/types";
import { sampleVerdict } from "../fixtures/sample-verdict";
import { LogoMark, Wordmark } from "./Logo";
import { emptyProgress, ProgressPanel, reduceProgress, type ProgressState } from "./ProgressPanel";
import { VerdictView } from "./VerdictView";

type ModeChoice = Mode | "auto";

const MODE_OPTIONS: { value: ModeChoice; label: string }[] = [
  { value: "auto", label: "Detect type" },
  { value: "vendor", label: "Software vendor" },
  { value: "shop", label: "Online shop" },
  { value: "marketplace", label: "Marketplace listing" },
];

const EXAMPLES: { url: string; mode: ModeChoice; note: string }[] = [
  { url: "atlassian.com", mode: "vendor", note: "Established vendor" },
  { url: "personio.com", mode: "vendor", note: "Old domain, newer brand" },
  { url: "https://kontorflow-demo.vercel.app", mode: "vendor", note: "Hollow vendor" },
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
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <header className="flex h-16 items-center justify-between">
        <a href="/" className="rounded-md" aria-label="Receipts home">
          <Wordmark />
        </a>
        <a href="?demo=1" className="press rounded-md px-1 text-sm text-muted hover:text-ink">
          Sample result
        </a>
      </header>

      <section className="pb-12 pt-12 sm:pb-16 sm:pt-24" aria-labelledby="hero-heading">
        <h1
          id="hero-heading"
          className="max-w-[15ch] text-balance font-serif text-[2.6rem] font-normal leading-[1.04] tracking-[-0.025em] sm:text-[3.75rem]"
        >
          Websites are free to fake. <span className="text-muted">History isn&apos;t.</span>
        </h1>
        <p className="mt-5 max-w-[54ch] text-pretty text-[17px] leading-relaxed text-muted">
          Paste a software vendor, a shop you saw in an ad, or a marketplace listing. Receipts checks what a site can&apos;t
          fake (domain age, archive history, company registers, outside reviews) and returns a verdict where every reason
          links to its proof.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-9 rounded-2xl border border-line bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-16px_rgb(0_0_0/0.16)] transition-[border-color,box-shadow] duration-200 focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_20%,transparent)]"
        >
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
            placeholder="example.com or a product link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full min-w-0 rounded-t-2xl bg-transparent px-5 pb-2 pt-4 text-lg outline-none placeholder:text-muted/60 focus-visible:outline-none"
          />
          <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
            <label htmlFor="mode" className="sr-only">
              What kind of site is it?
            </label>
            <span className="relative">
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ModeChoice)}
                className="press appearance-none rounded-lg bg-sunk py-2 pl-3 pr-8 text-sm text-ink hover:bg-line/70"
              >
                {MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden>
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <button
              type="submit"
              disabled={running || !url.trim()}
              className="press rounded-xl bg-ink px-5 py-2 text-sm font-semibold text-desk enabled:hover:bg-ink/85 disabled:opacity-35"
            >
              {running ? "Checking…" : "Check"}
            </button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-1 text-muted">Try</span>
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
              className="press rounded-full border border-line px-3 py-1.5 text-left hover:border-ink/20 hover:bg-paper disabled:opacity-40"
            >
              <span className="font-medium">{ex.url.replace(/^https:\/\/(www\.)?/, "").slice(0, 28)}</span>
              <span className="text-muted"> · {ex.note}</span>
            </button>
          ))}
        </div>
      </section>

      <div ref={resultRef} className="scroll-mt-4 space-y-8 pb-20">
        {error && (
          <div
            role="alert"
            className="rise flex flex-col gap-4 rounded-2xl border border-line bg-paper p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex gap-3">
              <span className={`mt-2 size-2 shrink-0 rounded-full ${error.kind === "rate" ? "bg-caution" : "bg-avoid"}`} aria-hidden />
              <div>
                <p className="font-semibold">
                  {error.kind === "rate" ? "Hourly limit reached" : error.kind === "input" ? "That address won't work" : "The check did not finish"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{error.msg}</p>
                {error.kind === "rate" && (
                  <p className="mt-1 text-sm text-muted">
                    Meanwhile,{" "}
                    <a href="?demo=1" className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                      see a sample result
                    </a>
                    .
                  </p>
                )}
              </div>
            </div>
            {error.kind === "retry" && last && (
              <button
                type="button"
                onClick={() => void run(last.input, last.m, last.fresh)}
                className="press shrink-0 self-start rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-desk hover:bg-ink/85 sm:self-center"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {warning && verdict && (
          <p role="status" className="flex gap-3 rounded-xl bg-caution/10 px-4 py-3 text-sm leading-relaxed text-caution">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-caution" aria-hidden />
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

const HOW = [
  { n: "1", t: "Read the site", d: "What it claims about itself. Cheap to fake, so it counts least." },
  { n: "2", t: "Pull the history", d: "Domain age, archive snapshots, certificates, company registers, outside mentions." },
  { n: "3", t: "Weigh and argue", d: "Models on Nebius decide, a skeptic argues back, a judge settles. Unsourced reasons are removed." },
];

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
    <footer className="border-t border-line py-12 text-sm">
      <h2 className="font-semibold">How it works</h2>
      <ol className="mt-4 grid gap-6 sm:grid-cols-3">
        {HOW.map((s) => (
          <li key={s.n}>
            <p className="font-mono text-xs text-muted">{s.n}</p>
            <p className="mt-1 font-medium">{s.t}</p>
            <p className="mt-1 leading-relaxed text-muted">{s.d}</p>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <a
            ref={linkRef}
            href="#"
            onClick={(e) => e.preventDefault()}
            draggable
            className="press inline-flex cursor-grab items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-2 font-medium hover:border-ink/20 active:cursor-grabbing"
            aria-describedby="bm-hint"
          >
            <LogoMark className="size-4 text-accent" />
            Check with Receipts
          </a>
          <p id="bm-hint" className="mt-2 text-xs text-muted">
            Drag it to your bookmarks bar, then click it on any shop or vendor page.
          </p>
        </div>
        <p className="text-xs text-muted">Every reason links to its proof.</p>
      </div>
    </footer>
  );
}
