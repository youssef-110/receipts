# Patina: 90-second pitch

**0:00 Hook.** "Anyone can generate a convincing website. Marketing is free now. History isn't."

**0:10 What it is.** Paste a URL, get Trust / Caution / Avoid / Unsure. Every reason links to a page we actually fetched. No source, no claim.

**0:20 Demo 1: fake or AI-made vendor/shop.** Paste the URL, or tap the kontorflow-demo.vercel.app chip (Hollow vendor). Polished site, but the domain is days old, no imprint, no registry entry, no third-party mentions. Verdict: **Avoid**. Click a reason, land on the RDAP / Wayback source. "These are the receipts."

**0:40 Demo 2: real company, ugly old site.** Paste it. Looks dated, but 10+ years of Wayback history, valid certs, company register hit, customers talking about it. Verdict: **Trust**. "Design is not trust. History is."

**0:55 Conflict case: personio.com.** Domain registered 2002, brand only around since ~2015. We surface the conflict instead of hiding it: domain age says one thing, brand age another. The skeptic agent argues the opposite verdict; the judge decides.

**1:05 Under the hood.** Open the "Model calls on Nebius Token Factory" panel (calls, model time, tokens, cache hits): every LLM call on Nebius Token Factory (decide, skeptic, judge, vision), with model, latency, tokens. A validator drops any reason whose evidence is not in the fetch ledger.

**1:15 Trust in our own code.** Norma checks every PR: all outbound HTTP goes through one polite, SSRF-guarded fetcher (robots.txt, rate limits, cache). Reruns are reproducible.

**1:22 Keeps working.** n8n weekly vendor watch re-checks your vendor list and pings you when a verdict flips.

**1:28 Close.** "Don't ask whether a site looks real. Ask for the receipts."
