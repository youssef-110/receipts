import assert from "node:assert/strict";
import { test } from "node:test";
import { ledger, withLedger } from "../net/ledger";
import type { Evidence } from "../types";
import type { DecideResult } from "./decide";
import { detectConflicts, hollowProfile, isIncident } from "./rubric";
import { repairId, validate } from "./validate";
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

const with_ = (e: Evidence, over: Partial<Evidence>): Evidence => ({ ...e, ...over });

test("repairId restores a missing collector prefix and case, refuses ambiguity", () => {
  const ids = ["registers:northdata-com", "mentions:customer-acme-com", "mentions:review-acme-com"];
  assert.equal(repairId("northdata-com", ids), "registers:northdata-com");
  assert.equal(repairId("Registers:Northdata-com", ids), "registers:northdata-com");
  assert.equal(repairId("acme-com", ids), null);
});

test("reason with a mangled id is repaired instead of dropped", () =>
  withLedger(async () => {
    const a = ev("registers:northdata-com", "third_party");
    const b = ev("rdap:registered", "time");
    [a, b].forEach((e) => ledger.record(e.url));
    const out = validate(draft({ reasons: [{ text: "registered", evidence_ids: ["northdata-com", b.id], stance: "for_trust" }] }), [a, b], prior);
    assert.equal(out.dropped_reasons.length, 0);
    assert.deepEqual(out.draft.reasons[0].evidence_ids, ["registers:northdata-com", "rdap:registered"]);
    assert.equal(out.draft.verdict, "Trust");
  }));

test("for_trust reason citing only undermining evidence is dropped", () =>
  withLedger(async () => {
    const stale = with_(ev("alive:latest-update", "time"), { polarity: "undermines" });
    ledger.record(stale.url);
    const out = validate(
      draft({ verdict: "Caution", reasons: [{ text: "still active", evidence_ids: [stale.id], stance: "for_trust" }] }),
      [stale],
      prior,
    );
    assert.equal(out.draft.reasons.length, 0);
    assert.match(out.dropped_reasons[0].why, /undermines/);
  }));

test("breach write-up labeled as a customer is not trust support and gets surfaced", () =>
  withLedger(async () => {
    const breach = ev("mentions:customer-lawfare-org", "third_party", { title: "Vendor and the Holiday Bear hack: a case study" });
    const reg = ev("registers:x", "third_party");
    const age = ev("wayback:brand-first-seen", "time");
    [breach, reg, age].forEach((e) => ledger.record(e.url));
    assert.ok(isIncident(breach));
    const out = validate(
      draft({ reasons: [{ text: "customers", evidence_ids: [breach.id, reg.id, age.id], stance: "for_trust" }] }),
      [breach, reg, age],
      prior,
    );
    assert.deepEqual(out.draft.reasons[0].evidence_ids, [reg.id, age.id]);
    assert.ok(out.draft.reasons.some((r) => r.stance === "against_trust" && r.evidence_ids.includes(breach.id)));
  }));

test("hollow profile (looked, found nothing, no history) is raised to Avoid; a register entry prevents it", () =>
  withLedger(async () => {
    const none = with_(ev("mentions:none", "third_party", { brand: "Kontor", domain: "kontor.example" }), { polarity: "neutral" });
    const plat = with_(ev("rdap:platform", "time"), { polarity: "neutral" });
    const copy = with_(ev("site:copyright", "claimed", { copyright_year: 2026 }), { polarity: "neutral" });
    [none, plat, copy].forEach((e) => ledger.record(e.url));
    const items = [none, plat, copy];
    assert.deepEqual(hollowProfile(items), ["mentions:none", "rdap:platform"]);
    const out = validate(
      draft({ verdict: "Caution", reasons: [{ text: "works", evidence_ids: [copy.id], stance: "for_trust" }] }),
      items,
      prior,
    );
    assert.equal(out.draft.verdict, "Avoid");
    assert.ok(out.draft.reasons.some((r) => r.stance === "against_trust" && r.evidence_ids.includes("mentions:none")));
    assert.equal(hollowProfile([...items, ev("registers:acme", "third_party", { entry_name: "Kontor GmbH" })]), null);
    const junk = ev("registers:other", "third_party", { entry_name: "Vercel UK Ltd", imprint_number_matches: false });
    assert.deepEqual(hollowProfile([...items, junk]), ["mentions:none", "rdap:platform"], "an unrelated register hit is not confirmation");
    const oldDomain = ev("rdap:registered", "time", { registered: "2015-01-01T00:00:00Z", registered_year: 2015 });
    assert.equal(hollowProfile([none, copy, with_(oldDomain, { polarity: "supports" })]), null);
    assert.equal(hollowProfile([plat, copy]), null, "no mentions:none means the search did not run: missing data, not hollow");
  }));

test("site:unreachable is citable although the failed fetch is not in the ledger", () =>
  withLedger(async () => {
    const down = with_(ev("site:unreachable", "claimed"), { polarity: "undermines" });
    const out = validate(
      draft({ verdict: "Avoid", reasons: [{ text: "site down", evidence_ids: [down.id], stance: "against_trust" }] }),
      [down],
      prior,
    );
    assert.equal(out.draft.reasons.length, 1);
    assert.equal(out.draft.verdict, "Avoid");
  }));
