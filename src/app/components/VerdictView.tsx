import type { ReactNode } from "react";
import type { Evidence, Mode, Polarity, Reason, Tier, Verdict, VerdictLabel } from "../../lib/types";

export const MODE_LABEL: Record<Mode, string> = {
  vendor: "Software vendor",
  shop: "Online shop",
  marketplace: "Marketplace listing",
};

const VERDICT_STYLE: Record<VerdictLabel, { text: string; bg: string; line: string; note: string }> = {
  Trust: { text: "text-trust", bg: "bg-trust", line: "border-trust", note: "The history checks out." },
  Caution: { text: "text-caution", bg: "bg-caution", line: "border-caution", note: "Proceed, but check the points below." },
  Avoid: { text: "text-avoid", bg: "bg-avoid", line: "border-avoid", note: "The evidence points against this site." },
  Unsure: { text: "text-unsure", bg: "bg-unsure", line: "border-unsure", note: "Not enough proof either way." },
};

export const TIERS: { tier: Tier; label: string; hint: string; cls: string }[] = [
  { tier: "claimed", label: "Vendor-claimed", hint: "What the site says about itself. Cheap to fake.", cls: "text-muted border-line" },
  { tier: "time", label: "Proven by time", hint: "Domain, archive and certificate history. Hard to fake.", cls: "text-accent border-accent/40" },
  { tier: "third_party", label: "Confirmed by third parties", hint: "Registers, press and reviews outside the site.", cls: "text-trust border-trust/40" },
  { tier: "red_flag", label: "Red flags", hint: "Signals that often come with scams.", cls: "text-avoid border-avoid/40" },
];
const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.tier, t])) as Record<Tier, (typeof TIERS)[number]>;

export function TierBadge({ tier }: { tier: Tier }) {
  const t = TIER_BY_ID[tier];
  return <span className={`inline-flex shrink-0 rounded border px-1.5 py-px text-[11px] font-medium ${t.cls}`}>{t.label}</span>;
}

export function PolarityIcon({ polarity }: { polarity: Polarity }) {
  const label = { supports: "Supports trust", undermines: "Undermines trust", neutral: "Neutral" }[polarity];
  const cls = { supports: "text-trust", undermines: "text-avoid", neutral: "text-muted" }[polarity];
  return (
    <svg viewBox="0 0 16 16" className={`size-4 shrink-0 ${cls}`} role="img" aria-label={label}>
      <title>{label}</title>
      {polarity === "supports" && <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      {polarity === "undermines" && <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      {polarity === "neutral" && <circle cx="8" cy="8" r="2.5" fill="currentColor" />}
    </svg>
  );
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A link to one piece of evidence. The URL always comes from our Evidence object, never from model text. */
function ReceiptLink({ e }: { e: Evidence }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5">
        <PolarityIcon polarity={e.polarity} />
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <a
          href={e.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-words font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          title={e.claim}
        >
          {e.source}
        </a>
        <TierBadge tier={e.tier} />
        {!e.verified && <span className="text-[11px] text-muted">found by search, not fetched</span>}
      </span>
    </li>
  );
}

function ReasonItem({ r, byId }: { r: Reason; byId: Map<string, Evidence> }) {
  const receipts = r.evidence_ids.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e));
  return (
    <li className="py-3">
      <p className="leading-snug">{r.text}</p>
      {receipts.length > 0 && <ul className="mt-2 space-y-1.5 pl-0.5">{receipts.map((e) => <ReceiptLink key={e.id} e={e} />)}</ul>}
    </li>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-paper p-5 sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function VerdictView({ v, sample }: { v: Verdict; sample?: boolean }) {
  const byId = new Map(v.evidence.map((e) => [e.id, e]));
  const style = VERDICT_STYLE[v.verdict] ?? VERDICT_STYLE.Unsure;
  const forTrust = v.reasons.filter((r) => r.stance === "for_trust");
  const against = v.reasons.filter((r) => r.stance === "against_trust");
  const pct = Math.round(Math.max(0, Math.min(1, v.confidence)) * 100);
  const totalLatency = v.llm.reduce((s, c) => s + c.latency_ms, 0);

  return (
    <div className="space-y-6">
      {/* The receipt */}
      <div className="receipt-shadow">
        <article className="receipt relative bg-paper px-5 pt-5 sm:px-8 sm:pt-7" aria-labelledby="verdict-heading">
          <div className="flex justify-between gap-4 font-mono text-xs text-muted">
            <span>Run {v.run.id}</span>
            <span>
              {new Date(v.run.started_at).toLocaleString()} / {(v.run.duration_ms / 1000).toFixed(1)} s
            </span>
          </div>
          {sample && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              Sample result with made-up data, to show how a verdict reads.
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted">{MODE_LABEL[v.mode] ?? v.mode}</p>
              <h2 id="verdict-heading" className="mt-0.5 break-all text-2xl font-semibold tracking-tight sm:text-3xl">
                {v.input}
              </h2>
            </div>
            <div className={`stamp self-start px-4 py-1.5 text-3xl font-extrabold uppercase sm:text-4xl ${style.text}`} aria-label={`Verdict: ${v.verdict}`}>
              {v.verdict}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className={`font-medium ${style.text}`}>{style.note}</span>
              <span className="tabular-nums text-muted">{pct}% confident</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Confidence">
              <div className={`h-full rounded-full ${style.bg}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <p className="mt-5 max-w-[65ch] text-[17px] leading-relaxed">{v.summary}</p>

          {(forTrust.length > 0 || against.length > 0) && (
            <div className="dotted mt-6 pb-1" aria-hidden />
          )}
          <div className="mt-2 grid gap-x-8 sm:grid-cols-2">
            {forTrust.length > 0 && (
              <div>
                <h3 className="pt-3 text-sm font-semibold text-trust">For trust</h3>
                <ul className="divide-y divide-line">{forTrust.map((r, i) => <ReasonItem key={i} r={r} byId={byId} />)}</ul>
              </div>
            )}
            {against.length > 0 && (
              <div>
                <h3 className="pt-3 text-sm font-semibold text-avoid">Against trust</h3>
                <ul className="divide-y divide-line">{against.map((r, i) => <ReasonItem key={i} r={r} byId={byId} />)}</ul>
              </div>
            )}
          </div>

          {v.conflicts.length > 0 && (
            <div className="mt-5 rounded-lg border border-caution/40 bg-caution/10 p-4">
              <h3 className="font-semibold text-caution">Evidence that disagrees</h3>
              <ul className="mt-1 divide-y divide-caution/20">
                {v.conflicts.map((c, i) => (
                  <ReasonItem key={i} r={{ text: c.text, evidence_ids: c.evidence_ids, stance: "against_trust" }} byId={byId} />
                ))}
              </ul>
            </div>
          )}

          {v.check_next.length > 0 && (
            <div className="mt-5">
              <h3 className="font-semibold">{v.verdict === "Unsure" ? "Unsure: check these next" : "Check these next"}</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 marker:text-muted">
                {v.check_next.map((c, i) => <li key={i} className="pl-1">{c}</li>)}
              </ol>
            </div>
          )}

          <p className="mt-6 text-center font-mono text-xs text-muted">
            {v.evidence.length} receipts / {v.evidence.filter((e) => e.verified).length} fetched this run
          </p>
        </article>
      </div>

      {v.skeptic && (
        <Section title="The skeptic's case" aside={<span className="text-sm text-muted">A second model argues against the verdict</span>}>
          <p className="text-sm text-muted">
            Argued for <span className={`font-semibold ${VERDICT_STYLE[v.skeptic.argued_for]?.text ?? ""}`}>{v.skeptic.argued_for}</span>, strength{" "}
            <span className="font-semibold text-ink">{v.skeptic.strength}</span>
          </p>
          <blockquote className="mt-2 border-l-2 border-line pl-4 leading-relaxed">{v.skeptic.argument}</blockquote>
          <ul className="mt-3 space-y-1.5">
            {v.skeptic.evidence_ids.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e)).map((e) => <ReceiptLink key={e.id} e={e} />)}
          </ul>
        </Section>
      )}

      <Section title="All evidence" aside={<span className="text-sm tabular-nums text-muted">{v.evidence.length} items</span>}>
        <div className="space-y-2">
          {TIERS.map((t) => {
            const items = v.evidence.filter((e) => e.tier === t.tier);
            return (
              <details key={t.tier} open={items.length > 0 && t.tier !== "claimed"} className="group rounded-lg border border-line">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <svg viewBox="0 0 16 16" className="size-3 text-muted transition-transform group-open:rotate-90" aria-hidden>
                    <path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  <span className="font-medium">{t.label}</span>
                  <span className="text-sm tabular-nums text-muted">{items.length}</span>
                  <span className="ml-auto hidden text-sm text-muted sm:inline">{t.hint}</span>
                </summary>
                {items.length === 0 ? (
                  <p className="px-4 pb-4 text-sm text-muted">Nothing found in this tier.</p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {items.map((e) => (
                      <li key={e.id} className="flex gap-3 px-4 py-3">
                        <PolarityIcon polarity={e.polarity} />
                        <div className="min-w-0 flex-1">
                          <p className="leading-snug">{e.claim}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                            <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                              {e.source}
                            </a>
                            <span className="break-all">{host(e.url)}</span>
                            {e.verified ? (
                              <span className="rounded bg-trust/10 px-1.5 text-[11px] font-medium text-trust">Fetched</span>
                            ) : (
                              <span className="rounded bg-unsure/15 px-1.5 text-[11px] font-medium text-unsure">Search result</span>
                            )}
                          </p>
                        </div>
                        {e.image && (
                          <img src={e.image} alt={`Image compared for: ${e.claim}`} loading="lazy" referrerPolicy="no-referrer" className="size-16 shrink-0 rounded-md border border-line object-cover" />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      </Section>

      <Section
        title="Powered by Nebius Token Factory"
        aside={<span className="text-sm tabular-nums text-muted">{v.llm.length} calls / {(totalLatency / 1000).toFixed(1)} s model time</span>}
      >
        {v.llm.length === 0 ? (
          <p className="text-sm text-muted">No model calls in this run.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-medium">Role</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Model</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Latency</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Tokens in / out</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Cached</th>
                  <th scope="col" className="py-2 font-medium">Request id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {v.llm.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 font-medium capitalize">{c.role}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{c.model}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{(c.latency_ms / 1000).toFixed(2)} s</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {c.prompt_tokens ?? "?"} / {c.completion_tokens ?? "?"}
                    </td>
                    <td className="py-2 pr-3">{c.cached ? "Yes" : "No"}</td>
                    <td className="py-2 font-mono text-xs text-muted">{c.request_id ?? "none"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-medium">
                  <td className="py-2 pr-3" colSpan={2}>Total</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{(totalLatency / 1000).toFixed(2)} s</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {v.llm.reduce((s, c) => s + (c.prompt_tokens ?? 0), 0)} / {v.llm.reduce((s, c) => s + (c.completion_tokens ?? 0), 0)}
                  </td>
                  <td className="py-2 pr-3">{v.run.cache_hits} hit{v.run.cache_hits === 1 ? "" : "s"}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      {(v.guards.length > 0 || v.dropped_reasons.length > 0) && (
        <section className="px-1 text-sm text-muted">
          <h2 className="font-semibold text-ink">Safety checks</h2>
          <p className="mt-1">
            Rules-only score before the AI step: {v.prior.band}, score {v.prior.score > 0 ? "+" : ""}{Math.round(v.prior.score * 10) / 10}.
          </p>
          {v.guards.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">{v.guards.map((g, i) => <li key={i}>{g}</li>)}</ul>
          )}
          {v.dropped_reasons.length > 0 && (
            <>
              <h3 className="mt-3 font-medium text-ink">Reasons we removed</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {v.dropped_reasons.map((d, i) => (
                  <li key={i}>
                    <span className="line-through decoration-muted/60">{d.text}</span> {d.why}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
