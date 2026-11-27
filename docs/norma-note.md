# Norma note

GitHub: https://github.com/youssef-110/receipts
Norma workspace: Youssef's Organization (repository `receipts`, project 12745)

Plan note: our Norma account is on the Free plan; Norma Pro was not available to us at the event. Policies and the "Norma Quality Gates" pull-request check are Pro-only, so we could not create the policy inside Norma or get a Norma check on each pull request. Everything below that Free supports is real: the Norma GitHub App is installed on the repository, two full Norma scans ran, and we fixed what the first scan found.

| | First scan (27 Nov, 17:50 CET) | Second scan (27 Nov, 18:06 CET) |
|---|---|---|
| Production-Ready Score | 73 / 100 | **86 / 100** |
| Security area | 55 %, 3 high issues | **100 %, 0 issues** |
| Issues | 48 | 45 |

## The policy we created

"All outbound HTTP requests must go through `src/lib/net/politeFetch.ts` (timeout, rate limit, cache, User-Agent, SSRF guard). Ban axios, node-fetch, got, undici and request."

Why this one: Receipts reads other people's websites, so being a polite, safe client is part of being trustworthy. The same rule matches the Stackgini challenge's ask not to hammer vendor sites, and it protects us from SSRF, since the user supplies the URL we fetch. It is written in `AGENTS.md` (rule 1) and enforced by ESLint (`eslint.config.mjs`: `no-restricted-globals` for `fetch`, `no-restricted-imports` for the five banned packages, switched off only in `politeFetch.ts` and the browser code). Because Norma Policies need Pro, this rule is enforced in the repo (AGENTS.md + ESLint, run before every commit) rather than as a Norma policy object; it is the exact text we would enter in Norma's New policy flow ("Ban axios, node-fetch, got, undici and request in every repository").

## How it kept authors consistent

Several coding agents wrote collectors in parallel (time collectors, site checks, third-party proof, shop mode, marketplace mode, the decision engine), each in its own pull request. Every one of them needed HTTP. With the rule in `AGENTS.md`, the Norma MCP server connected to each agent, and the ESLint ban as a hard stop, every collector, the Tavily client and even the Nebius client (`src/lib/llm/nebius.ts`) ended up calling `politeFetch`. So rate limits (1 request per second to a target site, at most 8 per 10 minutes per host), robots.txt, timeouts, caching, the User-Agent and the SSRF guard apply to all of them without each author re-implementing them. When we hardened `politeFetch` (see fixes below), every collector got the fix at once.

Example where one author repeated another's mistake: the site-checks author (`site.ts`) and the third-party-proof author (`mentions.ts`) both derived the brand from the registrable domain. On a shared platform such as `kontorflow-demo.vercel.app` both took "vercel" as the brand, so Receipts researched Vercel's customers and Vercel's company register and counted them as support for an unrelated site. Because both went through shared helpers, we fixed it once in `src/lib/net/domain.ts` (platform subdomains are their own registrable domain, as in the Public Suffix List; PR #17) and every collector got the fix.

## The finding we accepted on purpose

Rule `js-empty-catch-block-1.0` ("Empty Catch Block Swallows Errors"), high, `src/lib/collectors/site.ts:358`: the help-center content check.

We left it in place on purpose. After a help/docs link answers, we fetch it once more to see whether it is a near-empty placeholder ("articles coming soon"), a sign of a hollow vendor. If that optional fetch fails, the failure is not evidence either way: a timeout on a help page says nothing about whether the vendor is real. Throwing would abort the whole `site` collector and lose all its other evidence (copyright, imprint, dead links), and logging it as a `collector_error` would show judges a scary error for something harmless. The tradeoff is that a real bug in that block would go unnoticed; we accept it because the block only adds one optional item, the code comment says why, and the general pattern is still guarded: every collector runs inside `runCollector` (`src/lib/collectors/run.ts`), which turns any other failure into a visible `collector_error` event.

The same rule fires in a few other collectors (for example `marketplace/listing.ts`, `shop/common.ts`). Those are the same "optional lookup, absence is not evidence" pattern; we did not change them before the deadline.

## Fixes made after checks

Found by Norma and fixed (first scan → second scan):

- Rule `rct-unsafe-href-binding-1.0` ("Dynamic Value Bound to href Without URL Validation"), **3 high Security issues** in `src/app/components/VerdictView.tsx` (lines 65, 125, 361). Evidence URLs come from scraped pages and search results, so a `javascript:` or `data:` URL could have reached a link or image on our page. Fix: `safeUrl()` allows only http(s) for every evidence link and image (PR #25). Second scan: Security 100 %, 0 issues; score 73 → 86.

Found by our own automated security review and fixed, visible in git history (`git log --oneline`):

- `b00f1a0` Guard: block special-purpose IPv4/IPv6 ranges (benchmarking, TEST-NET, multicast/reserved, IPv4-mapped, NAT64, 6to4, Teredo), so a user-supplied URL cannot reach internal addresses. (`src/lib/net/guard.ts`)
- `0ef0e96` API: take the client IP for rate limiting from the trusted proxy header and bound the limiter map, so a client cannot dodge the 10-per-hour limit by sending its own `x-forwarded-for` or exhaust memory. (`src/app/api/check/route.ts`)
- `52ed73f` Prompt-injection hardening: only numeric and boolean evidence data go to the model (free text scraped from vendor pages stays out), and the Trust guard counts only time/third-party evidence cited by surviving reasons, so text planted on a page cannot talk the model into Trust. Same commit fixes brand-year citations being dropped. (`decide.ts`, `validate.ts`, `wayback.ts`)
- `d894999` `politeFetch` itself: manual redirects with the guard on every hop, response size caps, per-host lanes and budgets, bounded caches.

Norma score at submission: 86 / 100. Work landed as 26 pull requests (https://github.com/youssef-110/receipts/pulls?q=is%3Apr), each from a separate coding-agent author (commit authors "Receipts agent (…)") plus the human lead; the Norma per-PR check itself needs Pro, so PRs were checked by Norma's repository scans instead.
