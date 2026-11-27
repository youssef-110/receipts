// WP9 mp-images: one vision call on the listing's main image. No Tavily credits.

import { z } from "zod";
import { config } from "../../config";
import { chat } from "../../llm/nebius";
import type { Collector, Evidence, RunCtx } from "../../types";
import { getListing } from "./listing";
import { ev } from "./util";

const Vision = z.object({
  shows_titled_product: z.boolean().nullish(),
  looks_ai_generated: z.boolean().nullish(),
  what_it_shows: z.string().nullish(),
});

export const imagesCollector: Collector = {
  name: "mp-images",
  modes: ["marketplace"],
  timeoutMs: 50000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const L = await getListing(ctx);
    if (!L.title || !L.main_image || !/^https:\/\//.test(L.main_image)) return [];
    let v: z.infer<typeof Vision>;
    try {
      const res = await chat({
        role: "vision",
        model: config.models.vision,
        system:
          'You check a marketplace product photo. Return only JSON {"shows_titled_product": boolean, "looks_ai_generated": boolean, "what_it_shows": "<=12 words"}. looks_ai_generated is true only for clear generative-AI artifacts (warped text or logos, melted parts), not for clean studio renders.',
        user: `Listing title: ${L.title}${L.brand ? `\nBrand: ${L.brand}` : ""}\nDoes the image show this product?`,
        images: [L.main_image],
        json: true,
        maxTokens: 800, // Nemotron VL reasons before answering; 150 left no room for the JSON
      });
      const parsed = Vision.safeParse(res.json);
      if (!parsed.success) return [];
      v = parsed.data;
    } catch {
      return []; // vision model down or image not loadable: missing data is not negative evidence
    }
    const base = { url: L.url, verified: L.verified, tier: "third_party" as const, strength: 1 as const, source: `Vision model check of the ${L.marketplace} listing image`, image: L.main_image };
    const shows = (v.what_it_shows ?? "").slice(0, 80);
    const out: Evidence[] = [];
    if (v.shows_titled_product === false)
      out.push(ev("mp-images", "mismatch", { ...base, polarity: "undermines", claim: `The listing's main image does not appear to show the titled product (it shows: ${shows || "something else"}).`, data: { what_it_shows: shows } }));
    else if (v.shows_titled_product === true)
      out.push(ev("mp-images", "match", { ...base, polarity: "neutral", claim: `The listing's main image shows the titled product (${shows || "as described"}).`, data: { what_it_shows: shows } }));
    if (v.looks_ai_generated === true)
      out.push(ev("mp-images", "ai-generated", { ...base, polarity: "undermines", claim: "The listing's main image shows signs of AI generation (warped text, logos or parts).", data: { what_it_shows: shows } }));
    return out;
  },
};
