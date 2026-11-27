// WP9 owns this file. Marketplace-mode guidance appended to the decision prompt.
export const MARKETPLACE_PROMPT = `MARKETPLACE MODE: the URL is a product listing on a big marketplace (Amazon, eBay, Etsy, AliExpress, Temu, Otto, Kaufland, Zalando...). Judge the listing, its brand and its seller, never the marketplace itself.
- Star ratings and review counts shown on the listing (mp-listing:rating) are claims and easy to game with paid or recycled reviews. Never base Trust on them alone.
- Trust: a real brand whose own site lists this product (mp-brand:official-product) + a price in the normal market range (mp-price:in-market-range) + an established seller or the marketplace itself (mp-seller:sold-by-amazon), with no scam reports.
- Avoid: throwaway brand with no web presence beyond marketplaces (mp-brand:no-web-presence) + price far below market (mp-price:far-below-market), or scam reports naming this seller (mp-seller:report-*). One of these alone is Caution, not Avoid.
- A price far below market is the classic "too good to be true" signal for counterfeits and non-delivery scams.
- If the listing could not be read (mp-listing:unreadable) and little else is known, say Unsure and tell the user what to check.
- Review authenticity cannot be fully verified. When ratings matter to the verdict, add to check_next: "Read the most recent 1-star reviews and look for 'fake', 'counterfeit' or 'not as pictured'". Also suggest checking the seller profile (age, number of ratings) when the seller is not the marketplace itself.`;
