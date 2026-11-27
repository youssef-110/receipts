# Norma note

GitHub: https://github.com/youssef-110/receipts
Norma workspace: [WORKSPACE NAME]

## The policy we created

"All outbound HTTP requests must go through `src/lib/net/politeFetch.ts` (timeout, rate limit, cache, User-Agent, SSRF guard). Ban axios, node-fetch, got, undici and request."

Why this one: Receipts reads other people's websites, so being a polite, safe client is part of being trustworthy. The same rule matches the Stackgini challenge's ask not to hammer vendor sites, and it protects us from SSRF, since the user supplies the URL we fetch. It is written in `AGENTS.md` (rule 1) and enforced by ESLint (`eslint.config.mjs`: `no-restricted-globals` for `fetch`, `no-restricted-imports` for the five banned packages, switched off only in `politeFetch.ts` and the browser code). Norma policy/rule: [NORMA POLICY NAME / ID].

## How it kept authors consistent

Several coding agents wrote collectors in parallel (time collectors, site checks, third-party proof, shop mode, marketplace mode, the decision engine), each in its own pull request. Every one of them needed HTTP. With the rule in `AGENTS.md`, the Norma MCP server connected to each agent, and the ESLint ban as a hard stop, every collector, the Tavily client and even the Nebius client (`src/lib/llm/nebius.ts`) ended up calling `politeFetch`. So rate limits (1 request per second to a target site, at most 8 per 10 minutes per host), robots.txt, timeouts, caching, the User-Agent and the SSRF guard apply to all of them without each author re-implementing them. When we hardened `politeFetch` (see fixes below), every collector got the fix at once.

Example of a clash it prevented: [FILL IN: the real case where an agent reached for the global `fetch` or a second HTTP approach and the lint/Norma check caught it. Not recorded in the repo, so the team should confirm.]

## The finding we accepted on purpose

Norma flagged the broad `catch` in `src/lib/collectors/run.ts` (`runCollector`). [NORMA FINDING ID/RULE]

We accepted it. Receipts depends on a dozen outside sources (crt.sh, Wayback, RDAP, Tavily and others), and some are always slow or down. If one dead source could throw, a single timeout would kill the whole verdict. Instead the catch turns the failure into a visible `collector_error` event and the run continues with the evidence it has. Missing evidence is never treated as negative evidence, and the model is told when evidence is thin, so the worst case is a more cautious verdict, not a crash or a silent guess. The tradeoff is that the catch can hide a genuine bug in a collector; we accept that because the error is still reported in the progress stream and the code comment explains the decision.

## Fixes made after checks

All visible in git history (`git log --oneline`):

- `b00f1a0` Guard: block special-purpose IPv4/IPv6 ranges (benchmarking, TEST-NET, multicast/reserved, IPv4-mapped, NAT64, 6to4, Teredo), so a user-supplied URL cannot reach internal addresses. (`src/lib/net/guard.ts`)
- `0ef0e96` API: take the client IP for rate limiting from the trusted proxy header and bound the limiter map, so a client cannot dodge the 10-per-hour limit by sending its own `x-forwarded-for` or exhaust memory. (`src/app/api/check/route.ts`)
- `52ed73f` Prompt-injection hardening: only numeric and boolean evidence data go to the model (free text scraped from vendor pages stays out), and the Trust guard counts only time/third-party evidence cited by surviving reasons, so text planted on a page cannot talk the model into Trust. Same commit fixes brand-year citations being dropped. (`decide.ts`, `validate.ts`, `wayback.ts`)
- `d894999` `politeFetch` itself: manual redirects with the guard on every hop, response size caps, per-host lanes and budgets, bounded caches.

Norma score at submission: [PRODUCTION-READY SCORE]. Pull requests merged from different authors and checked by Norma: [NUMBERS / LINKS].
