"use client";

import { useEffect, useState } from "react";
import type { ProgressEvent } from "../../lib/types";

export type Stage = Extract<ProgressEvent, { type: "stage" }>["stage"];

export interface ProgressState {
  stage: Stage | null;
  seen: Stage[];
  msgs: Partial<Record<Stage, string>>;
  counts: Record<string, number>;
  errors: { collector: string; error: string }[];
  llmCalls: number;
  startedAt: number;
}

export const emptyProgress = (): ProgressState => ({
  stage: null,
  seen: [],
  msgs: {},
  counts: {},
  errors: [],
  llmCalls: 0,
  startedAt: Date.now(),
});

const STAGES: { id: Stage; label: string; skipped: string }[] = [
  { id: "site", label: "Read the site", skipped: "Skipped" },
  { id: "collect", label: "Collect history and outside records", skipped: "Skipped" },
  { id: "decide", label: "Weigh the evidence", skipped: "Skipped" },
  { id: "skeptic", label: "Argue the other side", skipped: "Skipped: the first AI step did not finish" },
  { id: "judge", label: "Make the final call", skipped: "Not needed: the skeptic did not make a strong case against the draft" },
  { id: "validate", label: "Check every reason has a receipt", skipped: "Skipped" },
  { id: "done", label: "Done", skipped: "Skipped" },
];

// The engine's decide message carries the raw rules-only score ("prior Trust (43)"); show the band only.
const tidy = (msg: string) => msg.replace(/prior (\w+) \(-?[\d.]+\)/, "rules-only verdict $1");

export function reduceProgress(s: ProgressState, e: ProgressEvent): ProgressState {
  switch (e.type) {
    case "stage":
      return {
        ...s,
        stage: e.stage,
        seen: s.seen.includes(e.stage) ? s.seen : [...s.seen, e.stage],
        msgs: e.msg ? { ...s.msgs, [e.stage]: tidy(e.msg) } : s.msgs,
      };
    case "evidence":
      return { ...s, counts: { ...s.counts, [e.collector]: (s.counts[e.collector] ?? 0) + e.items.length } };
    case "collector_error":
      return { ...s, errors: [...s.errors, { collector: e.collector, error: e.error }] };
    case "llm":
      return { ...s, llmCalls: s.llmCalls + 1 };
    default:
      return s;
  }
}

type RowState = "done" | "active" | "pending" | "skipped";

function rowState(p: ProgressState, i: number, current: number): RowState {
  const id = STAGES[i].id;
  if (p.stage === "done" || current > i) return p.seen.includes(id) ? "done" : "skipped";
  return current === i ? "active" : "pending";
}

function useElapsed(startedAt: number, running: boolean): number {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(t);
      setNow(Date.now()); // freeze on the finish time, not the last tick
    };
  }, [running]);
  return Math.max(0, now - startedAt) / 1000;
}

export function ProgressPanel({ p, running }: { p: ProgressState; running: boolean }) {
  const current = STAGES.findIndex((x) => x.id === p.stage);
  const total = Object.values(p.counts).reduce((a, b) => a + b, 0);
  const lastLabel = current >= 0 ? STAGES[current].label : "Starting";
  const elapsed = useElapsed(p.startedAt, running);

  return (
    <section className="rounded-xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="progress-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="progress-heading" className="text-lg font-semibold tracking-tight">
          {running ? "Checking" : "Check finished"}
          <span className="ml-2 font-mono text-sm font-normal tabular-nums text-muted" aria-label={`${Math.floor(elapsed)} seconds`}>
            {elapsed.toFixed(1)} s
          </span>
        </h2>
        <span className="text-sm tabular-nums text-muted">
          {total} receipts{p.llmCalls > 0 ? ` / ${p.llmCalls} model calls` : ""}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {lastLabel}. {total} receipts so far.
      </p>
      <ol className="mt-4 space-y-3">
        {STAGES.map((st, i) => {
          const state = rowState(p, i, current);
          return (
            <li key={st.id} className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden>
                {state === "done" && (
                  <svg viewBox="0 0 16 16" className="size-4 text-trust">
                    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                {state === "active" && <span className="pulse size-2.5 animate-ping rounded-full bg-accent" />}
                {state === "pending" && <span className="size-2 rounded-full bg-line" />}
                {state === "skipped" && <span className="h-0.5 w-3 rounded-full bg-muted/60" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={state === "pending" || state === "skipped" ? "text-muted" : "font-medium"}>
                  <span className={state === "skipped" ? "line-through decoration-muted/50" : undefined}>{st.label}</span>
                  <span className="sr-only"> ({state})</span>
                </p>
                {state === "skipped" && <p className="mt-0.5 text-sm text-muted">{st.skipped}</p>}
                {p.msgs[st.id] && (state === "done" || state === "active") && (
                  <p className="mt-0.5 break-words text-sm text-muted">{p.msgs[st.id]}</p>
                )}
                {st.id === "collect" && (Object.keys(p.counts).length > 0 || p.errors.length > 0) && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(p.counts).map(([c, n]) => (
                      <li key={c} className="rounded-md border border-line px-2 py-0.5 font-mono text-xs">
                        {c} <span className="text-accent">+{n}</span>
                      </li>
                    ))}
                    {p.errors.map((er, k) => (
                      <li key={`e${k}`} className="rounded-md border border-dashed border-line px-2 py-0.5 font-mono text-xs text-muted" title={er.error}>
                        {er.collector}: {er.error.length > 48 ? `${er.error.slice(0, 48)}…` : er.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
