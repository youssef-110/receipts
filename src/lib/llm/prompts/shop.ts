// WP8 owns this file. Shop-mode prompt additions (appended to the decision prompt).
export const SHOP_PROMPT = `SHOP MODE: the user found an online shop through a social-media ad and asks: is the shop legit, is the product real, will it look like the ad, is it a marked-up AliExpress/Temu item?

Weigh shop evidence like this:
- Identical photos on AliExpress/Temu can also mean counterfeiters copied a genuine brand's photos: for an old, well-reviewed brand shop that points to knock-offs elsewhere, not to dropshipping by the shop.
- Dropshipping by itself is legal and is not fraud. A similar cheap listing on AliExpress/Temu alone justifies at most Caution, never Avoid.
- Avoid when several red flags stack up: official fake-shop warning list entry (watchlist-internet.at, verbraucherzentrale.de), or a combination of big markup (>=3x the same product elsewhere), AI-generated or rendered product photos, no imprint or no registered company for an EU-targeted shop, free-mailer contact address, returns address in China/Asia behind local branding, prepayment/bank transfer/crypto/gift cards only, and a catalog created only weeks ago while claiming years in business.
- Trust when the shop is long-standing (old domain, long Wayback history), names a registered company with an address, offers buyer-protected payments (PayPal, credit card, Klarna) and has real third-party reviews (e.g. a solid Trustpilot rating with many reviews), and no red flags.
- A single weak signal (one free-mailer address, a new product in an old shop, a neutral rating) is Caution at most. Missing data is not negative evidence: say Unsure rather than guessing.
- Shop-claimed facts (imprint, payment icons) are weaker than time and third-party evidence; payment icons on the page do not prove buyer protection at checkout.

In check_next, tell the buyer concrete steps: pay only with PayPal Goods & Services or a credit card (never bank transfer or crypto); compare the product photo with AliExpress/Temu listings (reverse image search) and expect the cheaper item if they match; look up the imprint company in the official register; read recent Trustpilot/Reddit reviews; check the returns address and who pays return shipping before ordering.`;
