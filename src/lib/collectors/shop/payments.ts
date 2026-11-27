// WP8: payment methods advertised on the shop page (buyer protection vs. prepayment only). No fetches.

import { parse } from "node-html-parser";
import type { Collector, Evidence, RunCtx } from "../../types";
import { ev } from "./common";

const PROTECTED: [string, RegExp][] = [
  ["PayPal", /paypal/i],
  ["Klarna", /klarna/i],
  ["Apple Pay", /apple[\s_-]?pay/i],
  ["Google Pay", /google[\s_-]?pay/i],
  ["Shop Pay", /shop[\s_-]?pay|shopify[\s_-]?pay/i],
  ["Visa", /\bvisa\b/i],
  ["Mastercard", /master[\s_-]?card/i],
  ["American Express", /american[\s_-]?express|\bamex\b/i],
  ["Afterpay", /afterpay|clearpay/i],
];
const RISKY: [string, RegExp][] = [
  ["prepayment / bank transfer", /vorkasse|vorauskasse|bank[\s_-]?transfer|banküberweisung|überweisung|wire[\s_-]?transfer/i],
  ["crypto", /bitcoin|\bbtc\b|crypto|usdt|tether/i],
  ["gift cards", /gift[\s_-]?cards?\s+(?:as|for)\s+payment|pay(?:ment)?\s+(?:with|by)\s+gift[\s_-]?cards?|gutschein(?:karte)?\s+als\s+zahlung/i],
  ["Western Union", /western[\s_-]?union|moneygram/i],
];

/** Visible text plus payment-icon signals (img alt/src, Shopify "pi-*" icon ids), never raw script bodies. */
export function paymentSignals(html: string, text: string): string {
  const root = parse(html);
  const bits = [text];
  for (const img of root.querySelectorAll("img")) bits.push(`${img.getAttribute("alt") ?? ""} ${(img.getAttribute("src") ?? "").split("/").pop() ?? ""}`);
  for (const m of html.matchAll(/\b(?:aria-labelledby|id)=["']pi-([\w-]+)/g)) bits.push(m[1] ?? "");
  for (const el of root.querySelectorAll("[class*=payment],[class*=Payment]")) bits.push(`${el.getAttribute("class") ?? ""} ${el.text}`);
  return bits.join(" ").replace(/_/g, " ");
}

export const shopPaymentsCollector: Collector = {
  name: "shop-payments",
  modes: ["shop"],
  timeoutMs: 5000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const s = ctx.site;
    if (!s.html) return [];
    const sig = paymentSignals(s.html, s.text);
    const prot = PROTECTED.filter(([, re]) => re.test(sig)).map(([n]) => n);
    const risky = RISKY.filter(([, re]) => re.test(sig)).map(([n]) => n);
    const base = { url: s.finalUrl, source: "Shop website", verified: true } as const;
    if (prot.length) {
      return [
        ev("shop-payments", "buyer-protection", `The shop page advertises payment methods with buyer protection: ${prot.join(", ")}.`, {
          ...base,
          tier: "claimed",
          polarity: "supports",
          strength: 1,
          data: { protected: prot.join(", "), risky: risky.join(", ") || null },
        }),
      ];
    }
    if (risky.length) {
      return [
        ev("shop-payments", "prepayment-only", `The shop page shows only payment methods without buyer protection: ${risky.join(", ")}.`, {
          ...base,
          tier: "red_flag",
          polarity: "undermines",
          strength: 3,
          data: { risky: risky.join(", ") },
        }),
      ];
    }
    return [];
  },
};
