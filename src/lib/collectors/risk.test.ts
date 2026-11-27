import assert from "node:assert/strict";
import { test } from "node:test";
import { riskNear } from "./risk";

test("riskNear ignores an article praising a fraud-detection product (sardine.ai)", () => {
  const t =
    "TypeSafe AI calls it a System One model, after the fast, intuitive mode of thinking in Daniel Kahneman's Thinking, Fast and Slow. A fraud platform is full of places where software needs exactly that.";
  assert.equal(riskNear(t, "Fast"), null);
  assert.equal(riskNear("Fast ships anti-fraud checks and fraud detection for merchants", "Fast"), null);
});

test("riskNear still flags real fraud and lawsuits", () => {
  assert.equal(riskNear("Regulators accuse Fast of fraud in investor filings", "Fast")?.kind, "fraud");
  assert.equal(riskNear("Investors sued Fast after the shutdown", "Fast")?.kind, "lawsuit");
});
