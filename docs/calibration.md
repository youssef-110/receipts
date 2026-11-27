# Vendor-mode calibration

Internal notes. The URL list and expected labels are our own buyer calls for tuning, not public statements about any company.

## The set

`data/calibration/vendors.txt`, 17 URLs. Each URL has a `# expected: Label [Alt] — why` line above it. A hit on the main label counts as **strict**. A hit on the main label or on the bracketed alternative counts as **lenient**.

| Group | URLs | Expected |
|---|---|---|
| Big established SaaS | atlassian.com, slack.com, hubspot.com | Trust |
| Small or niche real B2B, incl. German Mittelstand with dated sites | sevdesk.de, datev.de, buhl.de, combit.net, paessler.com, plausible.io | Trust (plausible: Trust [Caution]) |
| Dead product, company gone | fast.co (checkout start-up, shut down 2022) | Avoid [Caution]: nobody is left to hold to a contract or to look after your data |
| Real product with a notable past breach | lastpass.com (2022 vault breach), solarwinds.com (2020 supply-chain compromise) | Caution [Trust]: the breach must be named in a reason either way |
| Hollow or generated SaaS | 3 x `*.lovable.app`, 1 x `*.vercel.app` template, `kontorflow-demo.vercel.app` (our fictional demo vendor) | Avoid (the found sites: Avoid [Unsure]) |

Run it:

```
pnpm receipts batch data/calibration/vendors.txt --mode vendor --concurrency 3 --out out/calibN
pnpm tsx data/calibration/score.ts out/calibN
```

`score.ts` prints one row per URL: expected, got, red flags present and cited, dropped reasons and guards.

## Accuracy

| Pass | What changed | Strict | Lenient |
|---|---|---|---|
| 1 (baseline) | none | 10/17 | 15/17 |
| 2 | new prompts and guards (see below), plus the lead's platform-subdomain domain fix | 17/17 | 17/17 |
| 3 (final code) | adds today's date, the red-flag relevance rule and the register-name check | 17/17 | 17/17 |

The baseline row counts kontorflow-demo as the Caution 0.55 that the lead reported before it was added to the set.

Misses in pass 1:
- **solarwinds.com: Trust, with the breach used as support.** Search found a Lawfare case study about the 2020 compromise. The mentions collector labeled it a "customer case study" (supports). The model then cited it as a customer.
- **fast.co: Caution, with weak reasons.** The model's main reason, `site:unreachable`, was dropped because the failed fetch is not in the ledger. What was left: "no MX record", generic "fast" mentions, and a false-positive "fraud" news item.
- **All 4 lovable/vercel pages: Unsure or Caution, none Avoid.** The model read "we searched and found nothing" as "missing data". It also called the 2026 copyright notice "future-dated".
- **LastPass: Caution (correct).** But one reason was dropped because the model cited `northdata-com` instead of `registers:northdata-com`.
- **buhl.de: Trust (correct).** But one for_trust reason cited `alive:latest-update` (2022, polarity undermines) as proof the vendor is "still operating".

## What changed and why

Prompts (`src/lib/llm/prompts/common.ts`, `vendor.ts`):
1. **Looked and found nothing ≠ missing data.** Use Unsure only when we could not look. Avoid applies to a vendor with zero independent confirmation (no third-party page, no matching register entry), no history older than a year (a new domain, or a shared-platform subdomain without Wayback history) and only self-claims. Any real footprint, such as a register entry, a few genuine mentions or years of history, keeps a small vendor out of Avoid.
2. **Incidents are not customers.** A page about a breach, hack, attack or lawsuit is a red flag stated against_trust, whatever the collector labeled it. The reverse also holds: a red-flag news item about something else (for example a fraud-detection product) is not evidence against the vendor.
3. **Breach policy.** A real product with a serious past breach is usually Caution, and the breach is named with what happened and when. An old, resolved incident alone is not grounds for Avoid.
4. **Dead products.** An unreachable site, activity that stopped years ago, or shutdown news means Avoid (Caution if only partly dead).
5. **Dated is not dead.** A dated site with decades of history and recent product activity is Trust.
6. **Stance matches polarity, and ids are copied exactly** (keep the collector prefix).
7. **Today's date is in the system prompt.** Without it the model calls a 2026 copyright "future-dated".

Deterministic rules (`src/lib/engine/rubric.ts`, `validate.ts`), covered by tests in `validate.test.ts`:
- `isIncident(e)` marks third-party "support" whose title or excerpt describes a breach, hack or attack. `detectConflicts` adds a rule conflict for each one, so the model sees it.
- `hollowProfile(evidence)` returns ids only when all of these hold:
  - `mentions:none` is present, so the searches actually ran.
  - The site was reachable.
  - No third-party item supports the vendor. A register hit counts only if the imprint number matches or the entry name contains the brand. This rules out junk hits such as "VERCEL UK LTD" or "Name".
  - Nothing shows history older than a year.

  When these hold, `detectConflicts` adds a "hollow profile" conflict, and validate raises any non-Avoid verdict to Avoid, with a cited reason.
- Validate also:
  - repairs model ids: exact, case-insensitive, or a unique match without the collector prefix;
  - lets `site:unreachable` and `site:blocked` be cited, because they describe our own failed attempt and their link is the URL we tried;
  - removes undermining or incident evidence from for_trust reasons, and drops a reason that has nothing else left;
  - adds the red flag as an against_trust reason when the red-flag cap turns Trust into Caution;
  - adds an uncited incident as an against_trust reason on any verdict except Avoid, so a known breach is always visible.

In pass 2 the prompt changes alone reached 17/17. No guard fired. The guards are a backstop for model variance, not the main driver.

## Remaining failure modes

- **Collector precision (WP3b, not engine):**
  - `mentions` labels every case study as `supports`, including breach write-ups such as the Lawfare and arXiv pages, and pages about other entities that share the brand word: "Copeland Buhl" (a law firm), "fast food", "fast-track".
  - `risk` news matched "fraud" in a fraud-detection article (sardine.ai, for fast.co).

  The prompts now tell the model to discount these, but in passes 2 and 3 the model still cited the Copeland Buhl page as Buhl support. In pass 3 it also still cited the sardine.ai "fraud" item against fast.co. The verdict was right, but that reason would not survive a source check. The real fix is in the collectors.
- **Breach coverage depends on search luck.** `risk` found no breach news for SolarWinds. We surface it only because the mentions search happened to return the Lawfare page. HIBP covers only account-dump breaches, not LastPass- or SolarWinds-style incidents.
- **Hollow rule versus new legitimate start-ups.** A real start-up with a domain under a year old, no register hit and no press will be called Avoid. This is deliberate ("would you hand them your data and money?"), but it is a judgment call. A register entry or a single real mention flips it.
- **Security vendors.** `isIncident` matches words such as "ransomware" or "breach". A security vendor's own customer stories ("how X stopped ransomware") can be tagged as incidents and surfaced as against_trust reasons. They do not cap the verdict, but the wording can look odd.
- **Small set.** 17 URLs, labeled by one person, with 5 hollow pages that look alike. Treat 17/17 as "no known systematic error", not as a measured accuracy.
