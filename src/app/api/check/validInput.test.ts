import assert from "node:assert/strict";
import { test } from "node:test";
import { validInput } from "./validInput";

test("validInput accepts domains and http(s) URLs, rejects the rest", () => {
  assert.equal(validInput("atlassian.com"), "atlassian.com");
  assert.equal(validInput(" https://www.amazon.com/dp/B08KTZ8249 "), "https://www.amazon.com/dp/B08KTZ8249");
  assert.equal(validInput("shop.example.co.uk/item?x=1"), "shop.example.co.uk/item?x=1");
  for (const bad of ["", "localhost", "javascript:alert(1)", "ftp://x.com", "a b.com", "https://u:p@x.com", 42, "x".repeat(2049) + ".com"]) {
    assert.equal(validInput(bad), null, String(bad).slice(0, 40));
  }
});
