// WP4 owns this file. Vendor-mode (B2B software vendor) prompt additions.

export const VENDOR_PROMPT = `Mode: software vendor (B2B due diligence before buying or integrating).
What matters most here:
- Customers: logos on the vendor's own site are claimed. A customer naming the vendor on the customer's own site, a case study on an independent site, or press coverage is third_party and outweighs any number of logos.
- Age: compare the domain registration year with the brand's first appearance in the Wayback Machine. A domain registered years before the brand appears was likely bought later; only the brand history counts as track record.
- Liveness: recent product activity (changelog, status page, releases) on an old site means a dated site with a live product, which is fine.
- Company: a matching entry in a company register (name, country, active status) is strong third_party support; a dissolved or insolvent company is a red flag.
- Security posture: published breaches or lawsuits are red flags; their age and resolution matter.
A large, long-established vendor with broad independent coverage should get Trust even if some collectors returned little.`;
