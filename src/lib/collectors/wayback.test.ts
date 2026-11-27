import assert from "node:assert/strict";
import { test } from "node:test";
import { containsBrand, firstBrandYear } from "./wayback";

const years = [2008, 2010, 2012, 2015, 2018, 2021, 2024];

test("firstBrandYear finds earliest year with brand", async () => {
  let calls = 0;
  const r = await firstBrandYear(years, async (y) => {
    calls++;
    return y >= 2015;
  });
  assert.equal(r, 2015);
  assert.ok(calls <= 4);
});

test("firstBrandYear returns null when never present, first year when always", async () => {
  assert.equal(await firstBrandYear(years, async () => false), null);
  assert.equal(await firstBrandYear(years, async () => true), 2008);
  assert.equal(await firstBrandYear([], async () => true), null);
});

test("containsBrand is case-insensitive and word-bounded", () => {
  assert.ok(containsBrand("<h1>Welcome to PERSONIO</h1>", ["Personio"]));
  assert.ok(!containsBrand("personios", ["Personio"]));
  assert.ok(containsBrand("a.b", ["a.b"]));
});
