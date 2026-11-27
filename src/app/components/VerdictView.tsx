import type { CSSProperties, ReactNode } from "react";
import type { Evidence, Mode, Polarity, Reason, Tier, Verdict, VerdictLabel } from "../../lib/types";

export const MODE_LABEL: Record<Mode, string> = {
  vendor: "Software vendor",
  shop: "Online shop",
  marketplace: "Marketplace listing",
};

const MODE_QUESTION: Record<Mode, string> = {
  vendor: "Can you trust this vendor?",
  shop: "Is this shop real?",
  marketplace: "Is this listing real?",
};

const VERDICT_STYLE: Record<VerdictLabel, { text: string; bg: string; note: string }> = {
  Trust: { text: "text-trust", bg: "bg-trust", note: "The history checks out." },
  Caution: { text: "text-caution", bg: "bg-caution", note: "Proceed, but check the points below." },
  Avoid: { text: "text-avoid", bg: "bg-avoid", note: "The evidence points against this site." },
  Unsure: { text: "text-unsure", bg: "bg-unsure", note: "Not enough proof either way." },
};

/** What to do, in plain words. This is the line most people read. */
const ADVICE: Record<VerdictLabel, Record<Mode, string>> = {
  Trust: {
    vendor: "Looks safe to work with.",
    shop: "Looks safe to buy from.",
    marketplace: "This listing looks genuine.",
  },
  Caution: {
    vendor: "Possibly fine. Read the warning signs before you sign or pay.",
    shop: "Possibly fine. Read the warning signs before you pay.",
    marketplace: "Possibly fine. Read the warning signs before you order.",
  },
  Avoid: {
    vendor: "Don't sign up or pay.",
    shop: "Don't buy here.",
    marketplace: "Don't order this listing.",
  },
  Unsure: {
    vendor: "We couldn't tell. Do the checks below before you sign or pay.",
    shop: "We couldn't tell. Do the checks below before you pay.",
    marketplace: "We couldn't tell. Do the checks below before you order.",
  },
};

const confidenceWord = (pct: number) => (pct >= 75 ? "High" : pct >= 50 ? "Medium" : "Low");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const TIERS: { tier: Tier; label: string; hint: string; dot: string }[] = [
  { tier: "claimed", label: "What the site says", hint: "Claims the site makes about itself. Cheap to fake.", dot: "bg-muted/50" },
  { tier: "time", label: "Its history", hint: "Domain age, archive snapshots, certificates. Hard to fake.", dot: "bg-accent" },
  { tier: "third_party", label: "What others confirm", hint: "Company registers, press and reviews outside the site.", dot: "bg-trust" },
  { tier: "red_flag", label: "Red flags", hint: "Signs that often come with scams.", dot: "bg-avoid" },
];
const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.tier, t])) as Record<Tier, (typeof TIERS)[number]>;

const LINK = "text-ink underline decoration-ink/25 underline-offset-[3px] transition-colors hover:decoration-ink";

/** Evidence URLs come from scraped pages and search results: only ever link or embed http(s), never javascript:/data:. */
export function safeUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function TierBadge({ tier }: { tier: Tier }) {
  const t = TIER_BY_ID[tier];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted">
      <span className={`size-1.5 rounded-full ${t.dot}`} aria-hidden />
      {t.label}
    </span>
  );
}

export function PolarityIcon({ polarity }: { polarity: Polarity }) {
  const label = { supports: "Supports trust", undermines: "Undermines trust", neutral: "Neutral" }[polarity];
  const cls = { supports: "text-trust", undermines: "text-avoid", neutral: "text-muted" }[polarity];
  return (
    <svg viewBox="0 0 16 16" className={`size-4 shrink-0 ${cls}`} role="img" aria-label={label}>
      <title>{label}</title>
      {polarity === "supports" && (
        <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {polarity === "undermines" && <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />}
      {polarity === "neutral" && <circle cx="8" cy="8" r="2" fill="currentColor" />}
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

/** Stagger for result sections, so they settle in reading order. */
const delay = (i: number): CSSProperties => ({ animationDelay: `${i * 60}ms` });

/** A link to one piece of evidence. The URL always comes from our Evidence object, never from model text. */
function ReceiptLink({ e }: { e: Evidence }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5">
        <PolarityIcon polarity={e.polarity} />
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
        <a href={safeUrl(e.url)} target="_blank" rel="noopener noreferrer nofollow" className={`break-words font-medium ${LINK}`} title={e.claim}>
          {e.source}
        </a>
        <TierBadge tier={e.tier} />
        {!e.verified && <span className="text-xs text-muted">search result</span>}
      </span>
    </li>
  );
}

// Image evidence worth comparing side by side (shop: dropship + AI-image checks; marketplace: listing image check).
const IMAGE_PREFIXES = ["shop-dropship:", "shop-images:", "mp-images:"];

const IMAGE_RESULT: Record<string, string> = {
  "same-product": "Same product sold on a marketplace",
  "ai-generated": "Looks AI-generated",
  match: "Shows the titled product",
  mismatch: "Does not show the titled product",
};

function AdCompare({ items, style }: { items: Evidence[]; style: CSSProperties }) {
  return (
    <Section title="Does it look like the ad?" aside="Photos checked by a vision model" style={style}>
      <ul className="grid gap-6 sm:grid-cols-2">
        {items.map((e) => {
          const shopImg = typeof e.data?.shop_image === "string" ? e.data.shop_image : null;
          const img = e.image ?? "";
          const pics = shopImg
            ? [
                { src: shopImg, label: "On the shop" },
                { src: img, label: `On ${host(e.url)}` },
              ]
            : [{ src: img, label: e.id.startsWith("mp-") ? "Listing photo" : "Shop photo" }];
          const result = IMAGE_RESULT[e.id.slice(e.id.indexOf(":") + 1)] ?? (e.polarity === "undermines" ? "Red flag" : "No problem found");
          const bad = e.polarity === "undermines";
          return (
            <li key={e.id} className={pics.length > 1 ? "sm:col-span-2" : "flex gap-4"}>
              <div className={pics.length > 1 ? "grid max-w-xl grid-cols-2 gap-3" : "w-28 shrink-0 sm:w-36"}>
                {pics.map((pic) => (
                  <figure key={pic.label} className="min-w-0">
                    <img
                      src={safeUrl(pic.src)}
                      alt={`${pic.label}: ${e.claim}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-square w-full rounded-xl border border-line bg-sunk object-contain"
                    />
                    <figcaption className="mt-1.5 truncate text-xs text-muted">{pic.label}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="min-w-0">
                <p className={`mt-3 flex items-center gap-2 text-sm font-semibold ${bad ? "text-avoid" : "text-trust"}`}>
                  <span className={`size-1.5 rounded-full ${bad ? "bg-avoid" : "bg-trust"}`} aria-hidden />
                  {result}
                </p>
                <p className="mt-1.5 leading-snug">{e.claim}</p>
                <a href={safeUrl(e.url)} target="_blank" rel="noopener noreferrer nofollow" className={`mt-1.5 inline-block text-sm ${LINK}`}>
                  {e.source}
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function BlockedNotice({ e, verdict }: { e: Evidence; verdict: VerdictLabel }) {
  const blocked = e.id === "site:blocked";
  const what = blocked ? `${host(e.url)} blocked automated access with a bot check, so we could not read the site itself.` : e.claim;
  return (
    <div className="mt-6 rounded-xl bg-sunk p-4 text-sm">
      <p className="font-semibold">
        {blocked ? "The site blocked our check" : e.id === "site:unreachable" ? "We could not reach the site" : "We could not read the listing"}
      </p>
      <p className="mt-1 leading-relaxed text-muted">
        {what}{" "}
        {verdict === "Unsure"
          ? "That is why the verdict is Unsure: a blocked or missing page is not evidence against the site, and the outside records alone are not enough to decide."
          : "The verdict rests on its history and outside records only."}{" "}
        Open the site in your own browser to see it.
      </p>
    </div>
  );
}

function PriorBand({ band }: { band: VerdictLabel }) {
  return (
    <span className="group relative inline-flex items-center gap-1.5">
      <span className={`font-semibold ${VERDICT_STYLE[band]?.text ?? ""}`}>{band}</span>
      <span
        tabIndex={0}
        aria-describedby="prior-tip"
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full border border-current text-[10px] font-bold leading-none text-muted"
      >
        ?<span className="sr-only">What is this?</span>
      </span>
      <span
        id="prior-tip"
        role="tooltip"
        className="invisible absolute left-0 top-full z-10 mt-2 w-72 translate-y-1 rounded-xl border border-line bg-paper p-3 text-xs leading-relaxed text-ink opacity-0 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)] transition-[opacity,transform] duration-150 ease-out group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"
      >
        The verdict a fixed set of scoring rules gives from the evidence alone, before any AI model reads it. The AI may
        disagree; the safety checks use this band as a guardrail.
      </span>
    </span>
  );
}

function ReasonItem({ r, byId }: { r: Reason; byId: Map<string, Evidence> }) {
  const receipts = r.evidence_ids.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e));
  return (
    <li className="py-4 first:pt-3">
      <p className="leading-snug">{r.text}</p>
      {receipts.length > 0 && <ul className="mt-2.5 space-y-1.5">{receipts.map((e) => <ReceiptLink key={e.id} e={e} />)}</ul>}
    </li>
  );
}

function Section({ title, children, aside, style }: { title: string; children: ReactNode; aside?: ReactNode; style?: CSSProperties }) {
  return (
    <section className="rise border-t border-line pt-7" style={style}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        {aside && <span className="text-sm text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}

export function VerdictView({ v, sample, onRecheck }: { v: Verdict; sample?: boolean; onRecheck?: () => void }) {
  const byId = new Map(v.evidence.map((e) => [e.id, e]));
  const style = VERDICT_STYLE[v.verdict] ?? VERDICT_STYLE.Unsure;
  const forTrust = v.reasons.filter((r) => r.stance === "for_trust");
  const against = v.reasons.filter((r) => r.stance === "against_trust");
  const pct = Math.round(Math.max(0, Math.min(1, v.confidence)) * 100);
  const totalLatency = v.llm.reduce((s, c) => s + c.latency_ms, 0);
  const tokensIn = v.llm.reduce((s, c) => s + (c.prompt_tokens ?? 0), 0);
  const tokensOut = v.llm.reduce((s, c) => s + (c.completion_tokens ?? 0), 0);
  const blocked = v.evidence.find((e) => ["site:blocked", "site:unreachable", "mp-listing:unreadable"].includes(e.id));
  const images = v.mode === "vendor" ? [] : v.evidence.filter((e) => e.image && IMAGE_PREFIXES.some((p) => e.id.startsWith(p)));
  let step = 1;

  return (
    <div className="space-y-10">
      <div>
        <article
          className="rise rounded-2xl border border-line bg-paper px-5 pb-5 pt-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-24px_rgb(0_0_0/0.2)] sm:px-8 sm:pb-6 sm:pt-7"
          aria-labelledby="verdict-heading"
        >
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-xs text-muted">
            <span>Run {v.run.id}</span>
            <span>
              {new Date(v.run.started_at).toLocaleString()} · {(v.run.duration_ms / 1000).toFixed(1)}s
            </span>
          </div>
          {sample && (
            <p className="mt-4 rounded-lg bg-sunk px-3 py-2 text-sm text-muted">Sample result with made-up data, to show how a verdict reads.</p>
          )}

          <p className="mt-6 text-sm text-muted">
            {MODE_QUESTION[v.mode] ?? "Can you trust this site?"} · {MODE_LABEL[v.mode] ?? v.mode}
          </p>
          <h2 id="verdict-heading" className="mt-1 break-all text-xl font-semibold tracking-[-0.015em] sm:text-2xl">
            {v.input.replace(/^https?:\/\/(www\.)?/, "")}
          </h2>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p
                style={{ animationDelay: "120ms" }}
                className={`reveal font-serif text-[3.5rem] font-medium leading-[0.9] tracking-[-0.03em] sm:text-[4.5rem] ${style.text}`}
                aria-label={`Verdict: ${v.verdict}`}
              >
                {v.verdict}
              </p>
              <p className="mt-4 max-w-[34ch] text-lg font-medium leading-snug">{ADVICE[v.verdict]?.[v.mode] ?? style.note}</p>
            </div>
            <div className="w-full sm:w-56 sm:pb-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">{confidenceWord(pct)} confidence</span>
                <span className="font-mono tabular-nums">{pct}%</span>
              </div>
              <div
                className="mt-2 h-1 overflow-hidden rounded-full bg-sunk"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label="Confidence"
              >
                <div className={`meter-fill h-full rounded-full ${style.bg}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          <p className="mt-7 max-w-[62ch] text-pretty font-serif text-[1.2rem] leading-[1.6]">{v.summary}</p>

          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-trust" aria-hidden />
              {plural(forTrust.length, "good sign")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-avoid" aria-hidden />
              {plural(against.length, "warning sign")}
            </span>
            <span>{plural(v.evidence.length, "source")} checked</span>
          </p>

          {blocked && <BlockedNotice e={blocked} verdict={v.verdict} />}

          {(forTrust.length > 0 || against.length > 0) && (
            <div className="mt-7 grid gap-x-10 border-t border-line sm:grid-cols-2">
              {forTrust.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 pt-5 text-sm font-semibold">
                    <span className="size-1.5 rounded-full bg-trust" aria-hidden />
                    Good signs
                  </h3>
                  <ul className="divide-y divide-line">{forTrust.map((r, i) => <ReasonItem key={i} r={r} byId={byId} />)}</ul>
                </div>
              )}
              {against.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 pt-5 text-sm font-semibold">
                    <span className="size-1.5 rounded-full bg-avoid" aria-hidden />
                    Warning signs
                  </h3>
                  <ul className="divide-y divide-line">{against.map((r, i) => <ReasonItem key={i} r={r} byId={byId} />)}</ul>
                </div>
              )}
            </div>
          )}

          {v.conflicts.length > 0 && (
            <div className="mt-6 rounded-xl bg-caution/10 px-4 pt-4">
              <h3 className="text-sm font-semibold text-caution">Mixed signals</h3>
              <ul className="divide-y divide-caution/15">
                {v.conflicts.map((c, i) => (
                  <ReasonItem key={i} r={{ text: c.text, evidence_ids: c.evidence_ids, stance: "against_trust" }} byId={byId} />
                ))}
              </ul>
            </div>
          )}

          {v.check_next.length > 0 && (
            <div className="mt-7">
              <h3 className="text-sm font-semibold">What you can do next</h3>
              <ol className="mt-3 space-y-2">
                {v.check_next.map((c, i) => (
                  <li key={i} className="flex gap-3 leading-snug">
                    <span className="w-4 shrink-0 pt-px text-right font-mono text-xs leading-5 text-muted">{i + 1}</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="mt-7 border-t border-dashed border-line pt-4 text-center font-mono text-xs text-muted">
            {v.evidence.length} sources · {v.evidence.filter((e) => e.verified).length} fetched this run
          </p>
        </article>

        {onRecheck && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 px-1 text-sm text-muted">
            <span>
              {v.run.cache_hits > 0
                ? `${v.run.cache_hits} AI answer${v.run.cache_hits === 1 ? "" : "s"} came from cache.`
                : "Repeat checks may reuse recent answers."}
            </span>
            <button
              type="button"
              onClick={onRecheck}
              className="press rounded-lg border border-line bg-paper px-3 py-1.5 font-medium text-ink hover:border-ink/25"
            >
              Re-check live
            </button>
          </div>
        )}
      </div>

      {images.length > 0 && <AdCompare items={images} style={delay(step++)} />}

      <div className="rise pt-6" style={delay(step++)}>
        <h2 className="font-serif text-[1.75rem] leading-tight tracking-[-0.02em]">How we got here</h2>
        <p className="mt-1.5 text-sm text-muted">The details behind the verdict, for anyone who wants to check our work.</p>
      </div>

      {v.skeptic && (
        <Section title="The other side of the argument" aside="A second AI model tries to prove the verdict wrong" style={delay(step++)}>
          <p className="text-sm text-muted">
            Argued for <span className={`font-semibold ${VERDICT_STYLE[v.skeptic.argued_for]?.text ?? ""}`}>{v.skeptic.argued_for}</span> · strength{" "}
            <span className="font-semibold text-ink">{v.skeptic.strength}</span>
          </p>
          <blockquote className="mt-3 border-l-2 border-line pl-4 font-serif text-[1.1rem] leading-relaxed">{v.skeptic.argument}</blockquote>
          <ul className="mt-4 space-y-1.5">
            {v.skeptic.evidence_ids.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e)).map((e) => <ReceiptLink key={e.id} e={e} />)}
          </ul>
        </Section>
      )}

      <Section title="Every source we checked" aside={<span className="tabular-nums">{v.evidence.length} items</span>} style={delay(step++)}>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
          {TIERS.map((t) => {
            const items = v.evidence.filter((e) => e.tier === t.tier);
            return (
              <details key={t.tier} open={items.length > 0 && t.tier !== "claimed"} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sunk/60">
                  <svg viewBox="0 0 16 16" className="size-3 shrink-0 text-muted transition-transform duration-200 ease-out group-open:rotate-90" aria-hidden>
                    <path d="M6 3.5l4.5 4.5L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className={`size-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden />
                  <span className="font-medium">{t.label}</span>
                  <span className="font-mono text-xs tabular-nums text-muted">{items.length}</span>
                  <span className="ml-auto hidden text-sm text-muted md:inline">{t.hint}</span>
                </summary>
                {items.length === 0 ? (
                  <p className="px-4 pb-4 pl-11 text-sm text-muted">Nothing found in this tier.</p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {items.map((e) => (
                      <li key={e.id} className="flex gap-3 px-4 py-3.5">
                        <span className="mt-0.5">
                          <PolarityIcon polarity={e.polarity} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="leading-snug">{e.claim}</p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                            <a href={safeUrl(e.url)} target="_blank" rel="noopener noreferrer nofollow" className={LINK}>
                              {e.source}
                            </a>
                            <span className="break-all font-mono text-xs">{host(e.url)}</span>
                            {e.verified ? (
                              <span className="text-xs text-trust">Fetched</span>
                            ) : (
                              <span className="text-xs text-muted">Search result</span>
                            )}
                          </p>
                        </div>
                        {e.image && (
                          <img
                            src={safeUrl(e.image)}
                            alt={`Image compared for: ${e.claim}`}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="size-16 shrink-0 rounded-lg border border-line object-cover"
                          />
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

      <Section title="Model calls on Nebius Token Factory" aside="Every model call in this run"style={delay(step++)}>
        {v.llm.length === 0 ? (
          <p className="text-sm text-muted">No model calls in this run.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Stat label="Calls" value={v.llm.length} />
              <Stat label="Model time" value={`${(totalLatency / 1000).toFixed(1)}s`} />
              <Stat label="Tokens in / out" value={`${tokensIn.toLocaleString("en")} / ${tokensOut.toLocaleString("en")}`} />
              <Stat label="Cache hits" value={v.run.cache_hits} />
            </dl>
            <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-paper">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">Model</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-medium">Latency</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-medium">Tokens in / out</th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">Cached</th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">Request id</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {v.llm.map((c, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-medium capitalize">{c.role}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{c.model}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums">{(c.latency_ms / 1000).toFixed(2)}s</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums">
                        {c.prompt_tokens ?? "?"} / {c.completion_tokens ?? "?"}
                      </td>
                      <td className="py-2.5 pr-4">{c.cached ? "Yes" : "No"}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-muted">{c.request_id ?? "none"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-medium">
                    <td className="px-4 py-2.5" colSpan={2}>Total</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums">{(totalLatency / 1000).toFixed(2)}s</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums">
                      {tokensIn} / {tokensOut}
                    </td>
                    <td className="py-2.5 pr-4">{v.run.cache_hits} hit{v.run.cache_hits === 1 ? "" : "s"}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Section>

      {v.prior && (
        <Section title="Safety checks on the AI" style={delay(step++)}>
          <p className="text-sm text-muted">
            Rules-only verdict before the AI: <PriorBand band={v.prior.band} />
          </p>
          {v.guards.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              {v.guards.map((g, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden />
                  {g}
                </li>
              ))}
            </ul>
          )}
          {v.dropped_reasons.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold">Reasons we removed</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-muted">
                {v.dropped_reasons.map((d, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden />
                    <span>
                      <span className="line-through decoration-muted/60">{d.text}</span> {d.why}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}
    </div>
  );
}
