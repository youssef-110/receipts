import assert from "node:assert/strict";
import { test } from "node:test";
import { ledger, withLedger } from "../net/ledger";
import type { Evidence } from "../types";
import type { DecideResult } from "./decide";
import { detectConflicts } from "./rubric";
import { validate } from "./validate";
import type { SiteSnapshot } from "../types";

const ev = (id: string, tier: Evidence["tier"], data?: Evidence["data"]): Evidence => ({
  id,
  collector: id.split(":")[0],
  claim: id,
  url: `https://example.org/${id.replace(":", "/")}`,
  tier,
  polarity: "supports",
  strength: 2,
  source: "test",
  fetched_at: new Date().toISOString(),
  verified: true,
  data,
});

const draft = (over: Partial<DecideResult>): DecideResult => ({
  verdict: "Trust",
  confidence: 0.9,
  summary: "s",
  reasons: [],
  conflicts: [],
  check_next: [],
  skeptic: null,
  llm: [],
  ...over,
});

const prior = { score: 0, band: "Caution" as const };

test("reason citing an unknown evidence id is dropped", () =>
  withLedger(async () => {
    const a = ev("rdap:registered", "time");
    const b = ev("mentions:customer", "third_party");
    [a, b].forEach((e) => ledger.record(e.url));
    const out = validate(
      draft({
        reasons: [
          { text: "real", evidence_ids: [a.id, b.id], stance: "for_trust" },
          { text: "made up", evidence_ids: ["ghost:id"], stance: "for_trust" },
        ],
      }),
      [a, b],
      prior,
    );
    assert.equal(out.draft.reasons.length, 1);
    assert.equal(out.dropped_reasons[0].text, "made up");
    assert.match(out.dropped_reasons[0].why, /unknown evidence id/);
    assert.equal(out.draft.verdict, "Trust");
  }));

test("reason citing evidence not in the ledger is dropped", () =>
  withLedger(async () => {
    const a = ev("rdap:registered", "time");
    const out = validate(draft({ reasons: [{ text: "x", evidence_ids: [a.id], stance: "for_trust" }] }), [a], prior);
    assert.equal(out.draft.reasons.length, 0);
    assert.equal(out.draft.verdict, "Unsure");
    assert.ok(out.draft.check_next.length > 0);
  }));

test("single-source Trust is downgraded to Caution", () =>
  withLedger(async () => {
    const a = ev("rdap:registered", "time");
    const b = ev("rdap:age", "time");
    [a, b].forEach((e) => ledger.record(e.url));
    const out = validate(draft({ reasons: [{ text: "old", evidence_ids: [a.id, b.id], stance: "for_trust" }] }), [a, b], prior);
    assert.equal(out.draft.verdict, "Caution");
    assert.ok(out.draft.confidence <= 0.6);
    assert.equal(out.guards.length, 1);
  }));

test("detectConflicts: bought domain, platform host, missing data", () => {
  const site = { host: "x.myshopify.com", isPlatformHost: true } as SiteSnapshot;
  const c = detectConflicts(
    [ev("rdap:registered", "time", { registered_year: 2005 }), ev("wayback:brand-first-seen", "time", { brand_first_year: 2019 })],
    site,
  );
  assert.equal(c.length, 2);
  assert.match(c[0].text, /bought later; brand history starts 2019/);
  assert.deepEqual(detectConflicts([], { ...site, isPlatformHost: false }), []);
});
