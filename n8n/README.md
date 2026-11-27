# n8n: weekly vendor watch

Reruns Receipts every Monday for each vendor your company depends on and posts to Discord when a verdict changes (for example, new breach news turns Trust into Caution).

## Set up (5 minutes)
1. In n8n Cloud: **Workflows → Import from file** → `vendor-watch.json`.
2. **Vendor list** node: edit the list of domains.
3. **Check with Receipts** node: replace `REPLACE-WITH-YOUR-APP.vercel.app` with the deployed app URL, and `REPLACE_WITH_WATCH_KEY` with the `WATCH_KEY` value from the app's environment (it skips the public rate limit).
4. **Alert on Discord** node: paste a Discord webhook URL (Discord server settings → Integrations → Webhooks → New webhook → Copy URL).
5. Click **Execute workflow** (the "Run now (demo)" trigger) once to record a run for the demo, then **Activate** the workflow so the Monday schedule runs.

Note: n8n keeps "last week's verdict" only for active (production) executions; manual runs alert on any non-Trust verdict so the demo shows an alert.
