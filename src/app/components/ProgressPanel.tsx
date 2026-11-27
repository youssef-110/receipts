import type { ProgressEvent } from "../../lib/types";

export type Stage = Extract<ProgressEvent, { type: "stage" }>["stage"];

export interface ProgressState {
  stage: Stage | null;
  msgs: Partial<Record<Stage, string>>;
  counts: Record<string, number>;
  errors: { collector: string; error: string }[];
  llmCalls: number;
}

export const emptyProgress = (): ProgressState => ({ stage: null, msgs: {}, counts: {}, errors: [], llmCalls: 0 });

const STAGES: { id: Stage; label: string }[] = [
  { id: "site", label: "Read the site" },
  { id: "collect", label: "Collect history and outside records" },
  { id: "decide", label: "Weigh the evidence" },
  { id: "skeptic", label: "Argue the other side" },
  { id: "judge", label: "Make the final call" },
  { id: "validate", label: "Check every reason has a receipt" },
  { id: "done", label: "Done" },
];

export function reduceProgress(s: ProgressState, e: ProgressEvent): ProgressState {
  switch (e.type) {
    case "stage":
      return { ...s, stage: e.stage, msgs: e.msg ? { ...s.msgs, [e.stage]: e.msg } : s.msgs };
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

export function ProgressPanel({ p, running }: { p: ProgressState; running: boolean }) {
  const current = STAGES.findIndex((x) => x.id === p.stage);
  const total = Object.values(p.counts).reduce((a, b) => a + b, 0);
  const lastLabel = current >= 0 ? STAGES[current].label : "Starting";

  return (
    <section className="rounded-xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="progress-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="progress-heading" className="text-lg font-semibold tracking-tight">
          {running ? "Checking" : "Check finished"}
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
          const state = current > i || p.stage === "done" ? "done" : current === i ? "active" : "pending";
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
              </span>
              <div className="min-w-0 flex-1">
                <p className={state === "pending" ? "text-muted" : "font-medium"}>
                  {st.label}
                  <span className="sr-only"> ({state})</span>
                </p>
                {p.msgs[st.id] && state !== "pending" && <p className="mt-0.5 break-words text-sm text-muted">{p.msgs[st.id]}</p>}
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
