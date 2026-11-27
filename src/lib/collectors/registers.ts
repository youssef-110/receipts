import { extract, search } from "../net/tavily";
import type { Collector, Evidence, RunCtx } from "../types";
import {
  brandOf,
  brandRe,
  clip,
  excerpt,
  hostOf,
  now,
  slug,
  within,
} from "./mentions";

// WP3b. Company-register entries (Germany via imprint HRB/HRA, UK Companies House, OpenCorporates).

const REGISTER_DOMAINS = [
  "northdata.de",
  "northdata.com",
  "opencorporates.com",
  "find-and-update.company-information.service.gov.uk",
  "unternehmensregister.de",
  "bundesanzeiger.de",
];
const INACTIVE =
  /\b(dissolved|in liquidation|liquidated|struck off|inactive|gelöscht|aufgelöst|insolvenz\w*|insolvency|bankrupt\w*)\b/i;
const FOUNDED =
  /(?:founded|incorporated|incorporation|registered|gegründet|gründung|eintragung|date of creation)\D{0,40}((?:19|20)\d{2})/i;

/** Register number the vendor claims in its imprint / legal pages. */
export function findRegisterNo(
  text: string,
): { no: string; court?: string } | null {
  const de = /\b(HR[AB])\s*(?:Nr\.?\s*)?(\d{2,6}\s?[A-Z]?)\b/.exec(text);
  if (de) {
    const court =
      /Amtsgericht\s+([A-ZÄÖÜ][\wäöüß-]+(?:\s+(?:am\s+)?[A-ZÄÖÜ][a-zäöüß][\wäöüß-]*)?)/.exec(
        text,
      )?.[1];
    return { no: `${de[1]} ${de[2]!.trim()}`, court };
  }
  const uk =
    /(?:company|registration)\s*(?:no\.?|number)\s*:?\s*((?:[A-Z]{2})?\d{6,8})\b/i.exec(
      text,
    );
  return uk ? { no: uk[1]! } : null;
}

export const registersCollector: Collector = {
  name: "registers",
  modes: ["vendor", "shop"],
  timeoutMs: 20000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const deadline = Math.min(ctx.deadline, Date.now() + 20000);
    const brand = brandOf(ctx.site);
    const domain = ctx.site.registrableDomain;
    const legal = [
      ...ctx.site.legalPages.map((p) => p.text),
      ctx.site.text,
    ].join("\n");
    const reg = findRegisterNo(legal);

    const res = await search(
      `"${brand}" ${reg?.no ?? domain} company register`,
      {
        include_domains: REGISTER_DOMAINS,
        max_results: 5,
      },
    );
    const hits = res.results
      .filter((r) => brandRe(brand).test(`${r.title} ${r.content}`))
      // Live entries first, so the one extract credit goes to the entry most likely to be the vendor.
      .sort((a, b) => Number(INACTIVE.test(`${a.title} ${a.content}`)) - Number(INACTIVE.test(`${b.title} ${b.content}`)));
    const seen = new Set<string>();
    const picks = hits
      // northdata.de and northdata.com show the same entry: dedupe on the site name.
      .filter((r) => {
        const site = hostOf(r.url).split(".").slice(-2)[0] ?? "";
        return !seen.has(site) && !!seen.add(site);
      })
      .slice(0, 2);
    if (!picks.length) return [];

    // Confirm the top entry by extracting it (1 credit), if there is time left.
    const left = deadline - Date.now() - 1500;
    const ex =
      left > 4000 ? await within(extract([picks[0]!.url]), left, []) : [];
    const page = ex[0]?.raw_content;

    return picks.flatMap((r, i): Evidence[] => {
      const host = hostOf(r.url);
      const fetched = i === 0 && !!page && brandRe(brand).test(page);
      const text = fetched ? page!.slice(0, 8000) : `${r.title} ${r.content}`;
      const regMatch =
        !!reg && text.replace(/\s/g, "").includes(reg.no.replace(/\s/g, ""));
      // Status from the snippet/title only: full register pages mention deleted officers and old addresses.
      const dead = INACTIVE.test(`${r.title} ${r.content}`);
      // Big vendors have dissolved subsidiaries: a dead entry only counts when it is the imprint's own number.
      if (dead && !regMatch) return [];
      const inactive = dead;
      const founded = FOUNDED.exec(text)?.[1] ?? null;
      const name = clip(
        (r.title.split(/\s[|–—-]\s|:\s/)[0] ?? r.title).replace(
          /\s+overview$/i,
          "",
        ),
        80,
      );
      const claim = inactive
        ? `${host} register entry "${name}" shows the company as dissolved, liquidated or insolvent`
        : `${host} lists a register entry "${name}"${regMatch ? ` matching imprint number ${reg!.no}` : ""}${founded ? `, registered ${founded}` : ""}`;
      return [
        {
          id: `registers:${slug(host)}`,
          collector: "registers",
          claim: clip(claim, 200),
          url: r.url,
          tier: inactive ? "red_flag" : "third_party",
          polarity: inactive ? "undermines" : "supports",
          strength: regMatch && !inactive ? 3 : 2,
          source: `Tavily -> ${host}`,
          fetched_at: now(),
          verified: fetched,
          data: {
            entry_name: name,
            register_no: reg?.no ?? null,
            court: reg?.court ?? null,
            imprint_number_matches: regMatch,
            founded_year: founded ? Number(founded) : null,
            excerpt: excerpt(text, brand),
          },
        },
      ];
    });
  },
};
