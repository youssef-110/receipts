import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmsBrand, incidentOf } from "./mentions";

test("incidentOf flags a breach write-up (Lawfare on SolarWinds) as an old security incident", () => {
  const r = incidentOf(
    "SolarWinds and the Holiday Bear Campaign: A Case Study for the Classroom | Lawfare",
    "Interested in a detailed-but-accessible case study of the Russian cyberespionage campaign that targeted SolarWinds in 2020",
    null,
    2026,
  );
  assert.deepEqual(r, { label: "a security incident", strength: 2 });
});

test("incidentOf rates a recent incident strength 3", () => {
  assert.deepEqual(incidentOf("Acme outage takes down EU customers", "In March 2025 Acme had a 9-hour outage", null, 2026), {
    label: "an outage",
    strength: 3,
  });
  assert.equal(incidentOf("Acme sued over data practices", "class action filed", "Mon, 02 Nov 2026 00:00:00 GMT", 2026)?.strength, 3);
});

test("incidentOf ignores customer stories and defence products", () => {
  assert.equal(incidentOf("SolarWinds Transforms Global Travel Management With Navan", "As a global leader in IT management software"), null);
  assert.equal(incidentOf("Fast fraud detection for fintechs", "anti-fraud scoring and fraud prevention platform"), null);
  assert.equal(incidentOf("Acme vulnerability management", "security without compromise"), null);
});

test("confirmsBrand drops another entity that shares the brand word (Copeland Buhl)", () => {
  const t =
    "From hours to minutes: How CoCounsel reimagined tax workflow efficiency at Copeland Buhl. How Copeland Buhl used CoCounsel Tax software to answer 14,000+ tax questions";
  assert.equal(confirmsBrand(t, "buhl", "buhl.de"), false);
  assert.equal(confirmsBrand(`${t} (see buhl.de)`, "buhl", "buhl.de"), true);
});

test("confirmsBrand keeps a real mention with company context", () => {
  const t = "the market leader WISO Steuer. Using the clever app from our partner Buhl Data Service GmbH reduces the effort";
  assert.equal(confirmsBrand(t, "buhl", "buhl.de"), true);
});

test("confirmsBrand ignores the lowercase word when the brand is a proper noun (Fast vs fast-track)", () => {
  const t = "When to implement fast-track production? A decision framework for supply chain software and systems";
  assert.equal(confirmsBrand(t, "Fast", "fast.co"), false);
  assert.equal(confirmsBrand("How Fast Food Chains Master Marketing with a loyalty app", "Fast", "fast.co"), false);
  assert.equal(confirmsBrand("Checkout startup Fast raised $102M for its one-click checkout platform", "Fast", "fast.co"), true);
});

test("confirmsBrand ignores sentence-start and compound uses of an everyday-word brand", () => {
  const t = "Fast food is simply where marketing is easiest to observe for any customer.\n\nFast-food chains move fast and use loyalty apps.";
  assert.equal(confirmsBrand(t, "Fast", "fast.co"), false);
  assert.equal(confirmsBrand(`${t} The checkout startup Fast sold its software to merchants.`, "Fast", "fast.co"), true);
  assert.equal(confirmsBrand("Speed tests at fast.com for every customer", "Fast", "fast.co"), false);
});
