import assert from "node:assert/strict";
import { test } from "node:test";
import { isBrandHost, modelTokens, parseListingUrl, toNum } from "./util";

test("parseListingUrl finds item ids", () => {
  assert.equal(parseListingUrl("https://www.amazon.de/Sony-WH-1000XM5-Kopfhorer/dp/B09Y2MYL5C/ref=sr_1_1").itemId, "B09Y2MYL5C");
  assert.equal(parseListingUrl("amazon.com/gp/product/b0bdhwdr12").itemId, "B0BDHWDR12");
  assert.equal(parseListingUrl("https://www.ebay.de/itm/256123456789?hash=x").itemId, "256123456789");
  assert.equal(parseListingUrl("https://www.etsy.com/listing/1234567/handmade-mug").itemId, "1234567");
  assert.equal(parseListingUrl("https://de.aliexpress.com/item/1005006123456789.html").itemId, "1005006123456789");
  assert.equal(parseListingUrl("https://www.amazon.de/Sony-WH-1000XM5-Kopfhorer/dp/B09Y2MYL5C").slugWords, "Sony WH 1000XM5 Kopfhorer");
  assert.equal(parseListingUrl("https://www.zalando.de/foo.html").marketplace, "zalando");
});

test("toNum handles EU and US formats", () => {
  assert.equal(toNum("1.299,00 €"), 1299);
  assert.equal(toNum("$1,299.99"), 1299.99);
  assert.equal(toNum("49,9"), 49.9);
  assert.equal(toNum(12), 12);
  assert.equal(toNum("n/a"), null);
});

test("modelTokens picks model numbers", () => {
  assert.deepEqual(modelTokens("Sony WH-1000XM5 Wireless Headphones"), ["wh-1000xm5"]);
});

test("isBrandHost only accepts the brand's own domain", () => {
  assert.equal(isBrandHost("sony.de", "sony"), true);
  assert.equal(isBrandHost("electronics.sony.co.uk", "sony"), true);
  assert.equal(isBrandHost("apple.com", "apple"), true);
  assert.equal(isBrandHost("toyota-usa.epc-data.com", "toyota"), false);
  assert.equal(isBrandHost("sonyreviews.blogspot.com", "sony"), false);
});
