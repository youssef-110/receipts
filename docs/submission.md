# Submission checklist (deadline 19:45 CET)

## Before 19:00
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass; `main` is merged and pushed
- [ ] App deployed; demo URL works; `NEBIUS_API_KEY`, `TAVILY_API_KEY`, `WATCH_KEY` set on the host
- [ ] Run atlassian.com and personio.com fresh once; screenshot the trace panel
- [ ] Norma: workspace named, finding ID/rule and score filled in `docs/norma-note.md`
- [ ] n8n workflow imported, run once, activated (`n8n/README.md`)

## Stackgini (blind products)
- [ ] 19:00: get the blind list, save it as `data/stackgini/blind.txt` (one URL per line)
- [ ] Run: `pnpm receipts batch data/stackgini/blind.txt --mode vendor --out out/blind`
- [ ] Check `out/blind/summary.md` for failures (`Check failed` rows) and rerun those if time allows
- [ ] Submit `out/blind/verdicts.json`. Format lives in `src/stackgini/format.ts`: [CONFIRM it matches Stackgini's email; set `STACKGINI_LABELS` if their labels differ]
- [ ] Optional scoring on the labelled set: `pnpm receipts score --verdicts <file> --script <path>`

## AIB submission form
| Field | Text |
|---|---|
| Project name | Patina |
| One-liner | Patina checks what a website can't fake. Websites are free to fake. History isn't. Paste a vendor, shop or marketplace URL and get a Trust / Caution / Avoid verdict where every reason links to a source we fetched. |
| Track | Research Agents |
| Demo URL | https://receipts-hex8.vercel.app |
| GitHub | https://github.com/youssef-110/receipts |
| Team | [TEAM MEMBER NAMES] |
| Challenges entered | Stackgini, Nebius, Norma, n8n |

### Description (copy-paste)
Patina is a research agent that doesn't believe the marketing. AI can build a convincing company website in an hour, but it can't fake a company's history. Paste a software vendor, an online shop from an ad, or a marketplace listing, and Patina collects evidence that is hard to fake: domain registration age, the Wayback Machine (when the brand actually first appears), certificate history, company registers, customers who mention the vendor on their own sites (via Tavily), breaches, scam watchlists and product photo checks. Evidence is tiered: claimed by the site, proven by time, confirmed by third parties, or a red flag. Models on Nebius Token Factory then decide, a second model from a different family argues against the verdict, and a judge settles contested cases. A citation validator drops any reason whose source we didn't fetch, and guards stop a Trust verdict unless independent time or third-party evidence backs it. When signals conflict (personio.com: domain from 2002, brand from 2017) we show the conflict instead of hiding it. A weekly n8n workflow re-checks your vendor list and alerts you when a verdict changes. Our own code is held to the same standard: Norma enforces one rule, all outbound HTTP goes through one polite, SSRF-guarded fetcher.

## Sponsor notes
- [ ] **Nebius**: demo link + models and decision point from `docs/nebius-note.md`
- [ ] **Norma**: GitHub link, workspace name [WORKSPACE NAME], note from `docs/norma-note.md` (accepted finding, fixes, clash example)
- [ ] **n8n**: workflow file `n8n/vendor-watch.json` and setup in `n8n/README.md`: reruns every Monday for each vendor in a list, posts to Discord when a verdict changes (needs `WATCH_KEY` header to skip the public rate limit). Add screenshot of the executed workflow.
- [ ] **Tavily**: mention in description (used for third-party evidence); no separate submission

## Final
- [ ] Everything submitted before 19:45 CET; keep the demo tab open for the 20:00 live demos (use `docs/demo-script.md`)
