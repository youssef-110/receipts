"use client";

import { useEffect, useState } from "react";
import type { ProgressEvent } from "../../lib/types";
import { LogoMark } from "./Logo";

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
  { id: "validate", label: "Check every reason has a source", skipped: "Skipped" },
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
    <section className="rise rounded-2xl border border-line bg-paper p-5 sm:p-7" aria-labelledby="progress-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="progress-heading" className="flex items-center gap-2.5 font-semibold">
          <LogoMark className={`size-4 text-ink ${running ? "spin-slow" : ""}`} />
          {running ? "Checking" : "Check finished"}
          <span className="ml-2.5 font-mono text-sm font-normal tabular-nums text-muted" aria-label={`${Math.floor(elapsed)} seconds`}>
            {elapsed.toFixed(1)}s
          </span>
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted">
          {total} sources{p.llmCalls > 0 ? ` · ${p.llmCalls} model calls` : ""}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {lastLabel}. {total} sources so far.
      </p>
      <ol className="mt-5">
        {STAGES.map((st, i) => {
          const state = rowState(p, i, current);
          return (
            <li key={st.id} className="relative flex gap-3.5 pb-4 last:pb-0">
              {i < STAGES.length - 1 && <span className="absolute left-[9.5px] top-6 bottom-1 w-px bg-line" aria-hidden />}
              <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden>
                {state === "done" && (
                  <span className="pop flex size-5 items-center justify-center rounded-full bg-sunk">
                    <svg viewBox="0 0 16 16" className="size-3 text-ink">
                      <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                {state === "active" && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent/12">
                    <span className="breathe size-2 rounded-full bg-accent" />
                  </span>
                )}
                {state === "pending" && <span className="size-2 rounded-full border border-line bg-paper" />}
                {state === "skipped" && <span className="h-px w-2.5 bg-muted/60" />}
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
                      <li key={c} className="rise rounded-md bg-sunk px-2 py-0.5 font-mono text-xs">
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
