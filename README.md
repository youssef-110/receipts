# Receipts

**Websites are free to fake. History isn't.**

Receipts is a research agent that doesn't believe the marketing. Paste a URL (a software vendor, an online shop from an ad, or a marketplace listing) and it returns a verdict: **Trust**, **Caution**, **Avoid** or **Unsure**. The agent collects evidence from sources a fake can't easily control (domain registration records, the Wayback Machine, certificate logs, company registers, what independent sites say about the company), lets an AI model on Nebius Token Factory weigh it, and shows every reason with a link to a page it actually fetched. No source, no claim.

Built at the Agentic Hackathon: From Research to Commerce (AI Agents Berlin, 27 November 2026), Research Agents track.

## Three modes

The mode is picked automatically from the URL and page (or forced with `--mode`).

| Mode | You paste | What Receipts checks |
|---|---|---|
| **Software vendor** | a vendor's website | domain age vs. when the brand first appears, certificate history, customers confirmed by third parties, company register entry, product still alive, breaches and risk news |
| **Online shop / ad** | the shop behind an ad | imprint and returns page, payment methods, product listing age and price, scam watchlists and reviews, dropshipping and AI-generated photo check |
| **Marketplace listing** | an Amazon, eBay, Etsy, AliExpress, Temu (also Walmart, Otto, Kaufland, Zalando) listing | price vs. market, whether the brand's own site sells it, seller reports, listing image check |

## How a verdict is made

1. **Collect.** Collectors for the chosen mode run in parallel, each with its own timeout. Every piece of evidence has a one-sentence claim, a source URL, a tier and a polarity (supports / undermines / neutral).
2. **Weigh by tier.** Evidence that is hard to fake counts more:
   - `claimed`: the site says it about itself (logos, "trusted by"). Weakest.
   - `time`: proven by time (domain registration, first Wayback capture of the brand, first certificate).
   - `third_party`: confirmed by independent sources (customers naming the vendor on their own sites, company registers, press, review sites). Strongest support.
   - `red_flag`: breaches, insolvency, scam reports. A serious one caps the verdict.
   A deterministic **prior score** (tier weight x strength) and rule-based **conflict detection** (for example: domain registered 2002 but the brand only appears in 2017) are computed first and handed to the model as hints.
3. **Decide, skeptic, judge on Nebius Token Factory.** One model reads the evidence and drafts the verdict. A second model from a different family argues the strongest case for a different verdict. Only when that case is not weak does a third model judge between them. See [docs/nebius-note.md](docs/nebius-note.md).
4. **Citation validator.** Any reason that cites no evidence, an unknown id, or a source we did not fetch or see this run is dropped and listed under "dropped reasons".
5. **Guards.** Trust is downgraded to Caution unless at least two cited supporting time/third-party items from at least two collectors back it, a strong red flag is present, or the cited support is only self-reported. If no reason survives, the verdict becomes Unsure. Page text is treated as untrusted data and never reaches the model as instructions.

In the end you get a verdict and a confidence level, along with the reasons and their source links, any conflicts, suggested "check next" steps, the skeptic's view and a trace of each model call.

## Run it

```bash
pnpm install
cp .env.example .env        # fill in TAVILY_API_KEY, NEBIUS_API_KEY, NEBIUS_BASE_URL
pnpm dev                    # web app at http://localhost:3000

# command line
pnpm receipts check atlassian.com                       # one URL, verdict JSON on stdout
pnpm receipts check <url> --mode shop --fresh           # force a mode, skip caches
pnpm receipts batch urls.txt --mode vendor --out out/blind   # many URLs from a file (one per line)
```

`batch` writes one JSON per URL, a `verdicts.json` (the Stackgini submission file) and a `summary.md`. Other commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

The web app calls `POST /api/check`, which streams progress events as NDJSON (send `Accept: application/json` for a single verdict). Public use is limited to 10 checks per hour per client.

## Sponsors used

- **Nebius Token Factory:** every AI decision (decide, skeptic, judge) plus vision and extraction calls. [docs/nebius-note.md](docs/nebius-note.md)
- **Tavily:** search and page extraction for third-party mentions, registers, risk news, shop watchlists and marketplace price checks.
- **Norma (Quality Clouds):** one policy, enforced while we built: all outbound HTTP goes through one polite, SSRF-guarded fetcher. [docs/norma-note.md](docs/norma-note.md)
- **n8n:** a weekly vendor watch that re-runs Receipts for each vendor you depend on and alerts Discord when a verdict changes. [n8n/README.md](n8n/README.md)

## Project structure

```
src/lib/types.ts            shared contracts (Evidence, Verdict, ...)
src/lib/config.ts           env, model ids, tier weights
src/lib/mode.ts             vendor / shop / marketplace detection
src/lib/collectors/         evidence collectors (+ shop/, marketplace/), registry in index.ts
src/lib/engine/             pipeline.ts (run), rubric.ts (prior, conflicts), decide.ts (LLM), validate.ts (citations, guards)
src/lib/llm/                Nebius client and prompts per mode
src/lib/net/                politeFetch (only HTTP path), SSRF guard, Tavily client, run ledger
src/app/                    Next.js site and /api/check
cli/receipts.ts             check / batch / score commands
src/stackgini/format.ts     verdict file format for the Stackgini challenge
n8n/                        weekly vendor-watch workflow
docs/                       architecture, Nebius and Norma notes, demo script, submission checklist
AGENTS.md                   rules every coding agent followed (the Norma policy lives here)
```

More: [docs/architecture.md](docs/architecture.md), [docs/demo-script.md](docs/demo-script.md).
