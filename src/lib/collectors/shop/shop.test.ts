import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanTitle, findLdProduct, isRelevantListing, listingPriceUsd, lowestPriceUsd, productFromPage } from "./common";
import { companyName, isEuTargeted } from "./legal";
import { paymentSignals } from "./payments";
import { claimedStartYear } from "./product";
import { trustpilotRating } from "./watchlists";

test("product from JSON-LD @graph and meta fallback", () => {
  const ld = [{ "@graph": [{ "@type": "Product", name: "Lamp", image: ["//cdn.x.com/a.jpg"], offers: { price: "49.95", priceCurrency: "EUR" } }] }];
  assert.equal(findLdProduct(ld)?.name, "Lamp");
  const p = productFromPage(ld, {}, "https://shop.de/p/lamp");
  assert.deepEqual([p.title, p.price, p.currency, p.images[0]], ["Lamp", 49.95, "EUR", "https://cdn.x.com/a.jpg"]);
  const m = productFromPage([], { "og:title": "Mug", "product:price:amount": "9,90", "product:price:currency": "EUR" }, "https://a.de/");
  assert.deepEqual([m.title, m.price], ["Mug", 9.9]);
});

test("title cleaning and price parsing", () => {
  assert.equal(cleanTitle("GlowPro™ Original LED Sunset Lamp 2026 | GlowPro Shop", "GlowPro"), "LED Sunset Lamp");
  assert.equal(lowestPriceUsd("Sunset lamp US $3.20 - free shipping, was $9.99"), 3.2);
  assert.ok(Math.abs((lowestPriceUsd("Lampe 4,99 € Versand") ?? 0) - 4.99 * 1.08) < 0.01);
  assert.equal(lowestPriceUsd("no price here"), null);
  assert.ok(Math.abs((listingPriceUsd("https://de.aliexpress.com/item/1.html?pdp_npi=6%40dis%21EUR%2197.29%2197.29%21", "$1.08") ?? 0) - 97.29 * 1.08) < 0.01);
  assert.ok(!isRelevantListing("Men's Wool Runner NZ Mid Waterproof", "Brown Hoodie Mens - Temu"));
  assert.ok(isRelevantListing("LED Sunset Lamp", "Sunset Projection Lamp LED Night Light - AliExpress"));
});

test("claims, EU targeting, payments, trustpilot", () => {
  assert.equal(claimedStartYear("Familienbetrieb seit 1998 in Köln"), 1998);
  assert.equal(claimedStartYear("Over 20 years of experience", new Date("2026-01-01")), 2006);
  assert.equal(claimedStartYear("Free shipping over 50 EUR"), null);
  assert.ok(isEuTargeted("lampe-shop.de", "<html>"));
  assert.equal(companyName("Impressum Firmenname: Drune Trading Private Limited, 12 Road"), "Drune Trading Private Limited");
  assert.equal(companyName("Angaben gemäß § 5 DDG Muster Lampen GmbH Hauptstraße 1"), "Muster Lampen GmbH");
  assert.equal(companyName("Company: Private Limited"), null);
  assert.ok(!isEuTargeted("lamp.com", '<html lang="en">$'));
  { const sig = paymentSignals('<svg aria-labelledby="pi-paypal"></svg><img alt="Klarna">', ""); assert.match(sig, /paypal/); assert.match(sig, /Klarna/); }
  assert.deepEqual(trustpilotRating("Reviews 1,234 • TrustScore 4.3 out of 5"), { score: 4.3, reviews: 1234 });
  assert.equal(trustpilotRating("Rated 5 out of 5 stars. Great shop").score, null);
  assert.deepEqual(trustpilotRating("Drune's 4-star rating ... Read 21-40 Reviews out of 145."), { score: 4, reviews: 145 });
  assert.equal(companyName("Angaben gemäß § 5 DDG Norvion Group LTD Office 1283 85 Dunstall Hill"), "Norvion Group LTD");
});
